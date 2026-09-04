import type {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { ScheduledReminderStatus } from "../notifications/notificationTypes.ts";

export interface ScheduledReminderRecord {
  id: ScheduledReminderId;
  ownerId: UserId;
  actorId: string;
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  assetName: string;
  assetType: AssetType;
  taskTitle: string;
  nextDue: string;
  fireAt: string;
  status: ScheduledReminderStatus;
  /** Reminder-only snooze expiry (`YYYY-MM-DD`), or null when never snoozed. */
  snoozedUntil: string | null;
  lastEventId: string;
  lastEventOccurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Port: notifications' own cancelable scheduled-reminder state, keyed by source
 * maintenance task. The scheduler consumes enriched events and mutates this; the
 * sweep reads `pending` reminders whose effective fire date has arrived. Neither
 * ever reads the maintenance-task tables.
 */
export interface ScheduledReminderRepository {
  save(reminder: ScheduledReminderRecord): Promise<void>;
  findPendingByTask(taskId: MaintenanceTaskId): Promise<ScheduledReminderRecord | null>;
  /**
   * The task's current cycle: its most recent reminder row by event occurrence.
   * A `canceled` result means the task was deleted (terminal); `superseded`
   * means the current cycle is not resolvable. Never reads maintenance-task
   * tables.
   */
  findCurrentByTask(taskId: MaintenanceTaskId): Promise<ScheduledReminderRecord | null>;
  /** Any reminder row for the exact cycle `(taskId, nextDue)`, newest first. */
  findByTaskAndCycle(
    taskId: MaintenanceTaskId,
    nextDue: string,
  ): Promise<ScheduledReminderRecord | null>;
  /** Current-cycle rows for many tasks at once (dashboard read model). */
  findCurrentByTasks(taskIds: MaintenanceTaskId[]): Promise<ScheduledReminderRecord[]>;
  /** Pending reminders whose effective fire date (`max(fireAt, snoozedUntil)`) is on or before `today`. */
  findDue(today: string): Promise<ScheduledReminderRecord[]>;
  /**
   * Any status transition other than a snooze: sets `status` and clears
   * `snoozedUntil` — a supersede, cancel, or reactivation always drops the
   * snooze (see notifications.md's cycle state machine).
   */
  updateStatus(
    id: ScheduledReminderId,
    status: ScheduledReminderStatus,
    updatedAt: Date,
  ): Promise<void>;
  /**
   * Replaces an existing pending cycle's snapshot and provenance in place
   * (title-only edit / same-`nextDue` event): status and snooze are untouched.
   */
  updateSnapshot(
    id: ScheduledReminderId,
    snapshot: Pick<ScheduledReminderRecord, "assetName" | "assetType" | "taskTitle" | "actorId">,
    provenance: Pick<ScheduledReminderRecord, "lastEventId" | "lastEventOccurredAt">,
    updatedAt: Date,
  ): Promise<void>;
  /**
   * The snooze transition: defers a `pending` cycle (`pending` → `pending` with
   * a new `snoozedUntil`) or re-arms a fired one (`fired` → `pending`). Applied
   * conditionally on the row still having `expectedStatus`; returns false when
   * a concurrent transition won the race. A re-arm that collides with a newer
   * pending cycle is rejected by the one-pending-per-task unique index and
   * throws — callers treat that as a lost race and retry.
   */
  snooze(
    id: ScheduledReminderId,
    expectedStatus: ScheduledReminderStatus,
    snoozedUntil: string,
    updatedAt: Date,
  ): Promise<boolean>;
}
