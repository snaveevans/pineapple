import type { EmailBatchId } from "@snaveevans/pineapple-shared";
import type { EmailBatchRecord } from "./EmailBatchRepository.ts";
import type { NotificationRecord } from "./NotificationRepository.ts";
import type { ScheduledReminderRecord } from "./ScheduledReminderRepository.ts";

export interface ReminderSweepNotificationCandidate {
  reminderId: ScheduledReminderRecord["id"];
  emailBatchId: EmailBatchId;
  notification: NotificationRecord;
}

export interface ReminderSweepPersistenceInput {
  candidates: ReminderSweepNotificationCandidate[];
  emailBatches: Omit<EmailBatchRecord, "status" | "suppressReason" | "notificationCount">[];
  updatedAt: Date;
}

export interface ReminderSweepPersistenceResult {
  createdNotifications: NotificationRecord[];
  emailBatches: EmailBatchRecord[];
}

/**
 * Port: atomically fires due reminders, creates in-app notifications, creates one
 * email batch per owner with new notifications, and enqueues durable outbound
 * email jobs for those batches.
 */
export interface ReminderSweepStore {
  findDue(today: string): Promise<ScheduledReminderRecord[]>;
  recordDueReminderSweep(
    input: ReminderSweepPersistenceInput,
  ): Promise<ReminderSweepPersistenceResult>;
}
