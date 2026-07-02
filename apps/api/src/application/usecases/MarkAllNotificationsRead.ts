import {
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Clock } from "../ports/Clock.ts";
import type { NotificationRepository } from "../ports/NotificationRepository.ts";

export type MarkAllNotificationsReadCommand = {
  ownerId: UserId;
};

export type MarkAllNotificationsReadResult = {
  unreadCount: number;
};

export class MarkAllNotificationsRead {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: MarkAllNotificationsReadCommand,
  ): Promise<Result<MarkAllNotificationsReadResult, DomainError>> {
    try {
      await this.notifications.markAllRead(command.ownerId, this.clock.now());
      const unreadCount = await this.notifications.countUnread(command.ownerId);
      return ok({ unreadCount });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
