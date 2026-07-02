import type {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { NotificationType } from "../notifications/notificationTypes.ts";

export interface NotificationRecord {
  id: NotificationId;
  ownerId: UserId;
  actorId: string;
  type: NotificationType;
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  assetName: string;
  assetType: AssetType;
  taskTitle: string;
  nextDue: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationPage {
  notifications: NotificationRecord[];
  nextCursor: string | null;
}

/**
 * Port: the durable in-app inbox. Reads are owner-scoped and newest-first with a
 * stable id tiebreak. Creation is idempotent on `(taskId, nextDue)`.
 */
export interface NotificationRepository {
  /** Inserts a notification, ignoring a duplicate `(taskId, nextDue)`; returns true if newly inserted. */
  insertIfAbsent(notification: NotificationRecord): Promise<boolean>;
  /** Notifications covered by one owner-scoped reminder email batch. */
  listByEmailBatch(batchId: EmailBatchId, ownerId: UserId): Promise<NotificationRecord[]>;
  findByIdForOwner(id: NotificationId, ownerId: UserId): Promise<NotificationRecord | null>;
  listByOwner(ownerId: UserId, limit: number, cursor: string | null): Promise<NotificationPage>;
  countUnread(ownerId: UserId): Promise<number>;
  /** Marks one owned notification read if unread; idempotent no-op when already read. */
  markRead(id: NotificationId, ownerId: UserId, readAt: Date): Promise<void>;
  /** Marks all of the owner's unread notifications read. */
  markAllRead(ownerId: UserId, readAt: Date): Promise<void>;
}
