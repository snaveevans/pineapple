import {
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  NotFoundError,
  ok,
  type Result,
  type NotificationId,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Clock } from "../ports/Clock.ts";
import type { NotificationRepository } from "../ports/NotificationRepository.ts";
import {
  type NotificationInboxItem,
  toNotificationInboxItem,
} from "./ListNotifications.ts";

export type MarkNotificationReadCommand = {
  notificationId: NotificationId;
  ownerId: UserId;
};

export class MarkNotificationRead {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: MarkNotificationReadCommand,
  ): Promise<Result<NotificationInboxItem, DomainError>> {
    try {
      const notification = await this.notifications.findByIdForOwner(
        command.notificationId,
        command.ownerId,
      );
      if (!notification) return err(new NotFoundError("Notification not found"));

      if (notification.readAt !== null) return ok(toNotificationInboxItem(notification));

      const readAt = this.clock.now();
      await this.notifications.markRead(command.notificationId, command.ownerId, readAt);

      return ok(toNotificationInboxItem({ ...notification, readAt }));
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
