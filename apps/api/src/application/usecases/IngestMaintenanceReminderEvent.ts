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
          await this.#reschedule(cmd);
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

  async #reschedule(
    cmd: Extract<IngestMaintenanceReminderEventCommand, { kind: "schedule" }>,
  ): Promise<void> {
    const now = this.clock.now();
    const pending = await this.reminders.findPendingByTask(cmd.taskId);
    if (pending) await this.reminders.updateStatus(pending.id, "superseded", now);

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
      lastEventId: cmd.eventId,
      lastEventOccurredAt: cmd.occurredAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  async #cancel(taskId: MaintenanceTaskId): Promise<void> {
    const pending = await this.reminders.findPendingByTask(taskId);
    if (pending) await this.reminders.updateStatus(pending.id, "canceled", this.clock.now());
  }
}
