import {
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type {
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import type { NotificationType } from "../notifications/notificationTypes.ts";

export const DEFAULT_NOTIFICATION_LIMIT = 20;
export const MAX_NOTIFICATION_LIMIT = 50;

export type NotificationInboxItem = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  asset: {
    id: string;
    name: string;
    type: AssetType;
  };
  task: {
    id: string;
    title: string;
    nextDue: string;
  };
};

export type NotificationInboxReadModel = {
  notifications: NotificationInboxItem[];
  unreadCount: number;
  nextCursor: string | null;
};

export type ListNotificationsQuery = {
  ownerId: UserId;
  limit: number;
  cursor: string | null;
};

/**
 * Owner-scoped durable inbox read model. The repository enforces owner filtering,
 * newest-first cursor pagination, unread counting, and uses stored snapshots so
 * rows remain renderable after source assets/tasks are deleted or archived.
 */
export class ListNotifications {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    query: ListNotificationsQuery,
  ): Promise<Result<NotificationInboxReadModel, DomainError>> {
    try {
      const [page, unreadCount] = await Promise.all([
        this.notifications.listByOwner(query.ownerId, query.limit, query.cursor),
        this.notifications.countUnread(query.ownerId),
      ]);

      return ok({
        notifications: page.notifications.map(toInboxItem),
        unreadCount,
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}

function toInboxItem(notification: NotificationRecord): NotificationInboxItem {
  return {
    id: notification.id,
    type: notification.type,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    asset: {
      id: notification.assetId,
      name: notification.assetName,
      type: notification.assetType,
    },
    task: {
      id: notification.maintenanceTaskId,
      title: notification.taskTitle,
      nextDue: notification.nextDue,
    },
  };
}
