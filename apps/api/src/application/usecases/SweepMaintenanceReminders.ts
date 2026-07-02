import {
  calendarDaysBetween,
  type DomainError,
  DomainError as DomainErrorClass,
  EmailBatchId,
  err,
  NotificationId,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { MaintenanceReminderCreated } from "../../domain/notification/events/MaintenanceReminderCreated.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { EmailBatchRecord } from "../ports/EmailBatchRepository.ts";
import type { NotificationRecord } from "../ports/NotificationRepository.ts";
import type { ReminderSweepStore } from "../ports/ReminderSweepStore.ts";
import type { Clock } from "../ports/Clock.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";

export type ReminderSweepOwnerGroup = {
  ownerId: UserId;
  notifications: NotificationRecord[];
};

export type ReminderSweepResult = {
  today: string;
  createdCount: number;
  createdByOwner: ReminderSweepOwnerGroup[];
  emailBatches: EmailBatchRecord[];
};

/**
 * Cron-sweep core for maintenance due-soon reminders. It reads only
 * notifications-owned scheduled reminder state, creates durable inbox rows
 * idempotently, marks reminders fired, and publishes one domain event per newly
 * created notification. The persistence port records in-app notifications, one
 * email batch per owner, and outbound email jobs atomically.
 */
export class SweepMaintenanceReminders {
  constructor(
    private readonly store: ReminderSweepStore,
    private readonly dates: UtcDateProvider,
    private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(): Promise<Result<ReminderSweepResult, DomainError>> {
    try {
      const today = this.dates.today();
      const now = this.clock.now();
      const due = await this.store.findDue(today);
      const batchIdsByOwner = new Map<UserId, EmailBatchId>();
      const candidates = due.map((reminder) => {
        const emailBatchId = getEmailBatchId(batchIdsByOwner, reminder.ownerId);
        return {
          reminderId: reminder.id,
          emailBatchId,
          notification: {
            id: NotificationId.generate(),
            ownerId: reminder.ownerId,
            actorId: "system",
            type: "maintenance_due_soon" as const,
            maintenanceTaskId: reminder.maintenanceTaskId,
            assetId: reminder.assetId,
            assetName: reminder.assetName,
            assetType: reminder.assetType,
            taskTitle: reminder.taskTitle,
            nextDue: reminder.nextDue,
            createdAt: now,
            readAt: null,
          },
        };
      });

      const emailBatches = Array.from(batchIdsByOwner, ([ownerId, id]) => ({
        id,
        ownerId,
        createdAt: now,
        updatedAt: now,
      }));
      const persisted = await this.store.recordDueReminderSweep({
        candidates,
        emailBatches,
        updatedAt: now,
      });
      const events = persisted.createdNotifications.map((notification) =>
        MaintenanceReminderCreated({
          notificationId: notification.id,
          maintenanceTaskId: notification.maintenanceTaskId,
          assetId: notification.assetId,
          ownerId: notification.ownerId,
          leadDays: calendarDaysBetween(today, notification.nextDue),
        }),
      );

      await this.eventBus.publishAll(events);

      return ok({
        today,
        createdCount: persisted.createdNotifications.length,
        createdByOwner: groupByOwner(persisted.createdNotifications),
        emailBatches: persisted.emailBatches,
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}

function getEmailBatchId(groups: Map<UserId, EmailBatchId>, ownerId: UserId): EmailBatchId {
  const existing = groups.get(ownerId);
  if (existing) return existing;
  const id = EmailBatchId.generate();
  groups.set(ownerId, id);
  return id;
}

function groupByOwner(notifications: NotificationRecord[]): ReminderSweepOwnerGroup[] {
  const groups = new Map<UserId, NotificationRecord[]>();
  for (const notification of notifications) {
    const existing = groups.get(notification.ownerId) ?? [];
    existing.push(notification);
    groups.set(notification.ownerId, existing);
  }
  return Array.from(groups, ([ownerId, grouped]) => ({ ownerId, notifications: grouped }));
}
