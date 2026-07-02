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
  lastEventId: string;
  lastEventOccurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Port: notifications' own cancelable scheduled-reminder state, keyed by source
 * maintenance task. The scheduler consumes enriched events and mutates this; the
 * sweep reads `pending` reminders whose `fireAt` has arrived. Neither ever reads
 * the maintenance-task tables.
 */
export interface ScheduledReminderRepository {
  save(reminder: ScheduledReminderRecord): Promise<void>;
  findPendingByTask(taskId: MaintenanceTaskId): Promise<ScheduledReminderRecord | null>;
  /** Pending reminders whose `fireAt` (date-only) is on or before `today`. */
  findDue(today: string): Promise<ScheduledReminderRecord[]>;
  updateStatus(
    id: ScheduledReminderId,
    status: ScheduledReminderStatus,
    updatedAt: Date,
  ): Promise<void>;
}
