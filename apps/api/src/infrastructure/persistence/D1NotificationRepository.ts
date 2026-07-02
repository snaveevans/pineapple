import {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../../application/ports/NotificationRepository.ts";
import type { NotificationType } from "../../application/notifications/notificationTypes.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";

type Row = {
  id: string;
  owner_id: string;
  actor_id: string;
  type: string;
  maintenance_task_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  task_title: string;
  next_due: string;
  created_at: string;
  read_at: string | null;
};

const COLUMNS =
  "id, owner_id, actor_id, type, maintenance_task_id, asset_id, asset_name, asset_type, task_title, next_due, created_at, read_at";

export class D1NotificationRepository implements NotificationRepository {
  constructor(private readonly db: D1Database) {}

  async insertIfAbsent(n: NotificationRecord): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO notifications (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (maintenance_task_id, next_due) DO NOTHING`,
      )
      .bind(
        n.id,
        n.ownerId,
        n.actorId,
        n.type,
        n.maintenanceTaskId,
        n.assetId,
        n.assetName,
        n.assetType,
        n.taskTitle,
        n.nextDue,
        n.createdAt.toISOString(),
        n.readAt?.toISOString() ?? null,
      )
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async listByEmailBatch(
    batchId: EmailBatchId,
    ownerId: UserId,
  ): Promise<NotificationRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM notifications
         WHERE email_batch_id = ? AND owner_id = ?
         ORDER BY next_due ASC, created_at ASC, id ASC`,
      )
      .bind(batchId, ownerId)
      .all<Row>();
    return (result.results ?? []).map(rowToRecord);
  }

  async findByIdForOwner(id: NotificationId, ownerId: UserId): Promise<NotificationRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM notifications WHERE id = ? AND owner_id = ?`)
      .bind(id, ownerId)
      .first<Row>();
    return row ? rowToRecord(row) : null;
  }

  async listByOwner(
    ownerId: UserId,
    limit: number,
    cursor: string | null,
  ): Promise<NotificationPage> {
    const decoded = cursor ? decodeCursor(cursor) : null;
    const rows = decoded
      ? await this.db
          .prepare(
            `SELECT ${COLUMNS} FROM notifications
             WHERE owner_id = ?
               AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .bind(ownerId, decoded.createdAt, decoded.createdAt, decoded.id, limit + 1)
          .all<Row>()
      : await this.db
          .prepare(
            `SELECT ${COLUMNS} FROM notifications
             WHERE owner_id = ?
             ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .bind(ownerId, limit + 1)
          .all<Row>();

    const results = rows.results ?? [];
    const page = results.slice(0, limit).map(rowToRecord);
    const hasMore = results.length > limit;
    const last = page.at(-1);
    return {
      notifications: page,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
    };
  }

  async countUnread(ownerId: UserId): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE owner_id = ? AND read_at IS NULL`)
      .bind(ownerId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async markRead(id: NotificationId, ownerId: UserId, readAt: Date): Promise<void> {
    await this.db
      .prepare(
        `UPDATE notifications SET read_at = ? WHERE id = ? AND owner_id = ? AND read_at IS NULL`,
      )
      .bind(readAt.toISOString(), id, ownerId)
      .run();
  }

  async markAllRead(ownerId: UserId, readAt: Date): Promise<void> {
    await this.db
      .prepare(`UPDATE notifications SET read_at = ? WHERE owner_id = ? AND read_at IS NULL`)
      .bind(readAt.toISOString(), ownerId)
      .run();
  }
}

function rowToRecord(row: Row): NotificationRecord {
  return {
    id: NotificationId.from(row.id),
    ownerId: UserId.from(row.owner_id),
    actorId: row.actor_id,
    type: row.type as NotificationType,
    maintenanceTaskId: MaintenanceTaskId.from(row.maintenance_task_id),
    assetId: AssetId.from(row.asset_id),
    assetName: row.asset_name,
    assetType: row.asset_type as AssetType,
    taskTitle: row.task_title,
    nextDue: row.next_due,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null,
  };
}

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`);
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = atob(cursor).split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
