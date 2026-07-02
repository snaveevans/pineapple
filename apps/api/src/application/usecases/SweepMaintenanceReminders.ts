import {
  calendarDaysBetween,
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  NotificationId,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { MaintenanceReminderCreated } from "../../domain/notification/events/MaintenanceReminderCreated.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import type { ScheduledReminderRepository } from "../ports/ScheduledReminderRepository.ts";
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
};

/**
 * Cron-sweep core for maintenance due-soon reminders. It reads only
 * notifications-owned scheduled reminder state, creates durable inbox rows
 * idempotently, marks reminders fired, and publishes one domain event per newly
 * created notification. Email batch creation is intentionally handled by the
 * later outbound-email task.
 */
export class SweepMaintenanceReminders {
  constructor(
    private readonly reminders: ScheduledReminderRepository,
    private readonly notifications: NotificationRepository,
    private readonly dates: UtcDateProvider,
    private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(): Promise<Result<ReminderSweepResult, DomainError>> {
    try {
      const today = this.dates.today();
      const now = this.clock.now();
      const due = await this.reminders.findDue(today);
      const created: NotificationRecord[] = [];
      const events: MaintenanceReminderCreated[] = [];

      for (const reminder of due) {
        const notification: NotificationRecord = {
          id: NotificationId.generate(),
          ownerId: reminder.ownerId,
          actorId: "system",
          type: "maintenance_due_soon",
          maintenanceTaskId: reminder.maintenanceTaskId,
          assetId: reminder.assetId,
          assetName: reminder.assetName,
          assetType: reminder.assetType,
          taskTitle: reminder.taskTitle,
          nextDue: reminder.nextDue,
          createdAt: now,
          readAt: null,
        };

        const inserted = await this.notifications.insertIfAbsent(notification);
        await this.reminders.updateStatus(reminder.id, "fired");

        if (!inserted) continue;

        created.push(notification);
        events.push(
          MaintenanceReminderCreated({
            notificationId: notification.id,
            maintenanceTaskId: notification.maintenanceTaskId,
            assetId: notification.assetId,
            ownerId: notification.ownerId,
            leadDays: calendarDaysBetween(today, notification.nextDue),
          }),
        );
      }

      await this.eventBus.publishAll(events);

      return ok({
        today,
        createdCount: created.length,
        createdByOwner: groupByOwner(created),
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
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
