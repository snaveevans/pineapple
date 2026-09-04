import {
  addCalendarDays,
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  InvariantError,
  MAINTENANCE_DUE_SOON_LEAD_DAYS,
  type MaintenanceTaskId,
  ok,
  type Result,
  ScheduledReminderId,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { Clock } from "../ports/Clock.ts";
import type { NotificationEventLog } from "../ports/NotificationEventLog.ts";
import type { ScheduledReminderRepository } from "../ports/ScheduledReminderRepository.ts";

/**
 * A maintenance-task event mapped into the scheduler's own vocabulary.
 * `schedule` covers create + advance (upsert the pending reminder for the new
 * cycle); `cancel` covers delete.
 */
export type IngestMaintenanceReminderEventCommand =
  | {
      kind: "schedule";
      eventId: string;
      occurredAt: Date;
      ownerId: UserId;
      actorId: string;
      taskId: MaintenanceTaskId;
      assetId: AssetId;
      assetName: string;
      assetType: AssetType;
      taskTitle: string;
      nextDue: string;
    }
  | {
      kind: "cancel";
      eventId: string;
      occurredAt: Date;
      taskId: MaintenanceTaskId;
    };

/**
 * Inbound notification consumer core: maintains notifications' own cancelable
 * scheduled-reminder state from enriched maintenance-task events. Deduped by
 * event id (redelivery is a no-op) and order-tolerant — a later-occurring event
 * always wins regardless of arrival order, resolved via the per-task max
 * `occurredAt` recorded in the event log. Never reads maintenance-task tables.
 *
 * Cycle rules (notifications.md): a same-`nextDue` event preserves the current
 * cycle — a `pending` row keeps its status and its snooze (a title-only edit or
 * same-`nextDue` reconciliation never drops a snooze), a `superseded` row is
 * reactivated with any stale snooze cleared, and `fired`/`canceled` rows are
 * left unchanged. A different `nextDue` supersedes the current pending row
 * (dropping its snooze) and schedules the new cycle, reusing a previously seen
 * unfired row instead of inserting a duplicate.
 */
export class IngestMaintenanceReminderEvent {
  constructor(
    private readonly reminders: ScheduledReminderRepository,
    private readonly eventLog: NotificationEventLog,
    private readonly clock: Clock,
    private readonly leadDays: number = MAINTENANCE_DUE_SOON_LEAD_DAYS,
  ) {}

  /**
   * Returns `ok` once the event is applied and recorded (or safely skipped as a
   * redelivery / stale event). Never throws: an unexpected failure — including a
   * concurrent write that trips the one-pending-reminder-per-task unique index —
   * is returned as `err` so the queue consumer retries it (transient), and the
   * event is left unrecorded so redelivery reconciles it via order resolution.
   * See docs/specs/cross-cutting/error-handling.md (durable queue-consumer flow).
   */
  async execute(cmd: IngestMaintenanceReminderEventCommand): Promise<Result<void, DomainError>> {
    try {
      if (await this.eventLog.hasProcessed(cmd.eventId)) return ok(undefined);

      const maxOccurred = await this.eventLog.maxOccurredAtForTask(cmd.taskId);
      const isStale = maxOccurred !== null && cmd.occurredAt.getTime() < maxOccurred.getTime();

      if (!isStale) {
        if (cmd.kind === "schedule") {
          await this.#schedule(cmd);
        } else {
          await this.#cancel(cmd.taskId);
        }
      }

      await this.eventLog.recordProcessed({
        eventId: cmd.eventId,
        maintenanceTaskId: cmd.taskId,
        occurredAt: cmd.occurredAt,
        processedAt: this.clock.now(),
      });
      return ok(undefined);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      return err(new InvariantError("Failed to ingest maintenance reminder event"));
    }
  }

  async #schedule(
    cmd: Extract<IngestMaintenanceReminderEventCommand, { kind: "schedule" }>,
  ): Promise<void> {
    const now = this.clock.now();
    const current = await this.reminders.findCurrentByTask(cmd.taskId);

    if (current && current.nextDue === cmd.nextDue) {
      // Same cycle: preserve it. Only a pending row takes the new snapshot; a
      // reactivation clears any stale snooze stored on the row; fired and
      // canceled cycles stay exactly as they are.
      if (current.status === "pending") {
        await this.reminders.updateSnapshot(
          current.id,
          {
            assetName: cmd.assetName,
            assetType: cmd.assetType,
            taskTitle: cmd.taskTitle,
            actorId: cmd.actorId,
          },
          { lastEventId: cmd.eventId, lastEventOccurredAt: cmd.occurredAt },
          now,
        );
      } else if (current.status === "superseded") {
        await this.reminders.updateStatus(current.id, "pending", now);
        await this.reminders.updateSnapshot(
          current.id,
          {
            assetName: cmd.assetName,
            assetType: cmd.assetType,
            taskTitle: cmd.taskTitle,
            actorId: cmd.actorId,
          },
          { lastEventId: cmd.eventId, lastEventOccurredAt: cmd.occurredAt },
          now,
        );
      }
      return;
    }

    // Different cycle: the old pending reminder is superseded (dropping its
    // snooze with it). A previously seen unfired cycle is reused/reactivated
    // instead of inserted again; a fired cycle stays fired and never re-fires
    // from an event; a canceled cycle is terminal history.
    if (current && current.status === "pending") {
      await this.reminders.updateStatus(current.id, "superseded", now);
    }

    const existing = await this.reminders.findByTaskAndCycle(cmd.taskId, cmd.nextDue);
    if (existing) {
      if (existing.status === "superseded") {
        await this.reminders.updateStatus(existing.id, "pending", now);
        await this.reminders.updateSnapshot(
          existing.id,
          {
            assetName: cmd.assetName,
            assetType: cmd.assetType,
            taskTitle: cmd.taskTitle,
            actorId: cmd.actorId,
          },
          { lastEventId: cmd.eventId, lastEventOccurredAt: cmd.occurredAt },
          now,
        );
      }
      return;
    }

    await this.reminders.save({
      id: ScheduledReminderId.generate(),
      ownerId: cmd.ownerId,
      actorId: cmd.actorId,
      maintenanceTaskId: cmd.taskId,
      assetId: cmd.assetId,
      assetName: cmd.assetName,
      assetType: cmd.assetType,
      taskTitle: cmd.taskTitle,
      nextDue: cmd.nextDue,
      fireAt: addCalendarDays(cmd.nextDue, -this.leadDays),
      status: "pending",
      snoozedUntil: null,
      lastEventId: cmd.eventId,
      lastEventOccurredAt: cmd.occurredAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  async #cancel(taskId: MaintenanceTaskId): Promise<void> {
    const current = await this.reminders.findCurrentByTask(taskId);
    // Deletion is terminal: cancel whatever the current cycle is (pending or
    // already fired) and drop its snooze with it, so a later snooze can never
    // re-arm a deleted task's reminder.
    if (current && (current.status === "pending" || current.status === "fired")) {
      await this.reminders.updateStatus(current.id, "canceled", this.clock.now());
    }
  }
}
