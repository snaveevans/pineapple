import type { MaintenanceTaskId } from "@snaveevans/pineapple-shared";

/**
 * Port: read-side view of notifications' snooze state for other read models
 * (the dashboard). Returns the current reminder cycle's raw `snoozedUntil` per
 * task, or null when the task has no reminder state or was never snoozed —
 * never reads maintenance-task storage.
 */
export interface TaskSnoozeReader {
  snoozedUntilByTask(taskIds: MaintenanceTaskId[]): Promise<Map<MaintenanceTaskId, string>>;
}
