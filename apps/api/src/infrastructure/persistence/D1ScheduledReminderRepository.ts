import {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type {
  ScheduledReminderRecord,
  ScheduledReminderRepository,
} from "../../application/ports/ScheduledReminderRepository.ts";
import type { ScheduledReminderStatus } from "../../application/notifications/notificationTypes.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";

type Row = {
  id: string;
  owner_id: string;
  actor_id: string;
  maintenance_task_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  task_title: string;
  next_due: string;
  fire_at: string;
  status: string;
  last_event_id: string;
  last_event_occurred_at: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, owner_id, actor_id, maintenance_task_id, asset_id, asset_name, asset_type, task_title, next_due, fire_at, status, last_event_id, last_event_occurred_at, created_at, updated_at";

export class D1ScheduledReminderRepository implements ScheduledReminderRepository {
  constructor(private readonly db: D1Database) {}

  async save(r: ScheduledReminderRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO scheduled_reminders (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           next_due = excluded.next_due,
           fire_at = excluded.fire_at,
           status = excluded.status,
           last_event_id = excluded.last_event_id,
           last_event_occurred_at = excluded.last_event_occurred_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        r.id,
        r.ownerId,
        r.actorId,
        r.maintenanceTaskId,
        r.assetId,
        r.assetName,
        r.assetType,
        r.taskTitle,
        r.nextDue,
        r.fireAt,
        r.status,
        r.lastEventId,
        r.lastEventOccurredAt.toISOString(),
        r.createdAt.toISOString(),
        r.updatedAt.toISOString(),
      )
      .run();
  }

  async findPendingByTask(taskId: MaintenanceTaskId): Promise<ScheduledReminderRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM scheduled_reminders
         WHERE maintenance_task_id = ? AND status = 'pending'`,
      )
      .bind(taskId)
      .first<Row>();
    return row ? rowToRecord(row) : null;
  }

  async findDue(today: string): Promise<ScheduledReminderRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM scheduled_reminders
         WHERE status = 'pending' AND fire_at <= ?
         ORDER BY owner_id, id`,
      )
      .bind(today)
      .all<Row>();
    return (result.results ?? []).map(rowToRecord);
  }

  async updateStatus(id: ScheduledReminderId, status: ScheduledReminderStatus): Promise<void> {
    await this.db
      .prepare(`UPDATE scheduled_reminders SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(status, new Date().toISOString(), id)
      .run();
  }
}

function rowToRecord(row: Row): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.from(row.id),
    ownerId: UserId.from(row.owner_id),
    actorId: row.actor_id,
    maintenanceTaskId: MaintenanceTaskId.from(row.maintenance_task_id),
    assetId: AssetId.from(row.asset_id),
    assetName: row.asset_name,
    assetType: row.asset_type as AssetType,
    taskTitle: row.task_title,
    nextDue: row.next_due,
    fireAt: row.fire_at,
    status: row.status as ScheduledReminderStatus,
    lastEventId: row.last_event_id,
    lastEventOccurredAt: new Date(row.last_event_occurred_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
