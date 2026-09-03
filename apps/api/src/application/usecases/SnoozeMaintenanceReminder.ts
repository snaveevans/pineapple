import {
  addCalendarDays,
  type AssetId,
  ConflictError,
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  ForbiddenError,
  InvariantError,
  type MaintenanceTaskId,
  NotFoundError,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { MaintenanceReminderSnoozed } from "../../domain/notification/events/MaintenanceReminderSnoozed.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  ScheduledReminderRecord,
  ScheduledReminderRepository,
} from "../ports/ScheduledReminderRepository.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { canAccessAsset } from "./assetAccess.ts";

const MAX_SNOOZE_ATTEMPTS = 4;

export type SnoozeMaintenanceReminderCommand = {
  taskId: MaintenanceTaskId;
  assetId: AssetId;
  requesterId: UserId;
};

export type SnoozeMaintenanceReminderResult = {
  taskId: MaintenanceTaskId;
  /** Server-computed snooze expiry: `todayUtc + 1` calendar day (`YYYY-MM-DD`). */
  snoozedUntil: string;
};

/**
 * Postpones the pending reminder of one maintenance-task cycle to
 * `todayUtc + 1` without touching the task's schedule: `nextDue`,
 * `lastCompletedDate`, recurrence, urgency, and completion evidence are
 * unchanged, no maintenance record is created, and no `MaintenanceTask*` event
 * is published. Performs the shared task-then-asset-then-access check (same
 * order as task edit/reschedule) before resolving the reminder state.
 * Snooze writes notifications-owned state only — the maintenance write gate
 * does not apply.
 */
export class SnoozeMaintenanceReminder {
  constructor(
    private readonly tasks: MaintenanceTaskRepository,
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly reminders: ScheduledReminderRepository,
    private readonly dates: UtcDateProvider,
    private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: SnoozeMaintenanceReminderCommand,
  ): Promise<Result<SnoozeMaintenanceReminderResult, DomainError>> {
    try {
      const task = await this.tasks.findById(command.taskId);
      if (!task) return err(new NotFoundError("Maintenance task not found"));
      if (task.assetId !== command.assetId) {
        return err(new NotFoundError("Maintenance task not found"));
      }

      const asset = await this.assets.findById(task.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (!(await canAccessAsset(asset, command.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }

      // Snoozing a task on an archived asset is permitted, matching task
      // edit/reschedule; only new tasks/records are blocked.

      const snoozedUntil = addCalendarDays(this.dates.today(), 1);

      for (let attempt = 0; attempt < MAX_SNOOZE_ATTEMPTS; attempt++) {
        const current = await this.reminders.findCurrentByTask(command.taskId);
        if (!current) return err(this.missingReminderState(command.taskId));
        // Captured as a plain string so the fail-closed branch below can report
        // any unexpected runtime value, even after the union is exhausted.
        const status: string = current.status;
        if (status === "canceled") {
          // Terminal: the task was deleted. A canceled cycle never reactivates.
          return err(new NotFoundError("Maintenance task not found"));
        }
        if (status === "superseded") {
          return err(this.missingReminderState(command.taskId));
        }
        if (status !== "pending" && status !== "fired") {
          return err(
            new InvariantError(
              `Reminder cycle for task ${command.taskId} is in unexpected status "${status}"`,
            ),
          );
        }

        if (!(await this.#snooze(current, snoozedUntil))) continue;

        await this.eventBus.publish(
          MaintenanceReminderSnoozed({
            maintenanceTaskId: current.maintenanceTaskId,
            scheduledReminderId: current.id,
            assetId: current.assetId,
            ownerId: current.ownerId,
            actorId: command.requesterId,
            snoozedUntil,
          }),
        );
        return ok({ taskId: command.taskId, snoozedUntil });
      }

      return err(new ConflictError("Concurrent modification conflict"));
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }

  /**
   * The conditional snooze write. Any failure inside the retry window — the
   * row's status changed, or a concurrent cycle created a competing pending
   * row (one-pending-per-task unique index) — is treated as a lost race and
   * retried against fresh state.
   */
  async #snooze(current: ScheduledReminderRecord, snoozedUntil: string): Promise<boolean> {
    try {
      return await this.reminders.snooze(
        current.id,
        current.status,
        snoozedUntil,
        this.clock.now(),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return false;
      }
      throw error;
    }
  }

  private missingReminderState(taskId: MaintenanceTaskId): NotFoundError {
    // Logged as an anomaly: the dashboard offers snooze only on tasks with a
    // reminder descriptor, so reaching this means notifications state and the
    // read model diverged. Never fabricated — the operation fails closed.
    console.error({ taskId }, "Snooze target has no current reminder cycle");
    return new NotFoundError("Maintenance reminder not found");
  }
}
