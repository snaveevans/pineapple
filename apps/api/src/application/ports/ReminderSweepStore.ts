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
  /** The sweep's UTC calendar date; the write re-verifies fire eligibility against it. */
  today: string;
  candidates: ReminderSweepNotificationCandidate[];
  emailBatches: Omit<EmailBatchRecord, "status" | "suppressReason" | "notificationCount">[];
  updatedAt: Date;
}

export interface ReminderSweepPersistenceResult {
  /** Rows this sweep genuinely inserted — re-fired cycles re-activate instead. */
  createdNotifications: NotificationRecord[];
  /**
   * Existing inbox rows re-activated by a snooze re-fire (unread, re-dated,
   * re-linked to this sweep's batch). Per notifications.md, a re-fire emits
   * another `MaintenanceReminderCreated` carrying the same notification id, so
   * these rows publish events too.
   */
  reactivatedNotifications: NotificationRecord[];
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
