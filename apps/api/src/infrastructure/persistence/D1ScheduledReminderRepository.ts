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
import type { TaskSnoozeReader } from "../../application/ports/TaskSnoozeReader.ts";
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
  snoozed_until: string | null;
  status: string;
  last_event_id: string;
  last_event_occurred_at: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, owner_id, actor_id, maintenance_task_id, asset_id, asset_name, asset_type, task_title, next_due, fire_at, snoozed_until, status, last_event_id, last_event_occurred_at, created_at, updated_at";

/** Newest cycle first: event occurrence, then insertion time, then stable id. */
const CURRENT_ORDER = "ORDER BY last_event_occurred_at DESC, created_at DESC, id DESC";

export class D1ScheduledReminderRepository
  implements ScheduledReminderRepository, TaskSnoozeReader
{
  constructor(private readonly db: D1Database) {}

  async save(r: ScheduledReminderRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO scheduled_reminders (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           next_due = excluded.next_due,
           fire_at = excluded.fire_at,
           snoozed_until = excluded.snoozed_until,
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
        r.snoozedUntil,
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

  async findCurrentByTask(taskId: MaintenanceTaskId): Promise<ScheduledReminderRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM scheduled_reminders
         WHERE maintenance_task_id = ?
         ${CURRENT_ORDER}
         LIMIT 1`,
      )
      .bind(taskId)
      .first<Row>();
    return row ? rowToRecord(row) : null;
  }

  async findByTaskAndCycle(
    taskId: MaintenanceTaskId,
    nextDue: string,
  ): Promise<ScheduledReminderRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM scheduled_reminders
         WHERE maintenance_task_id = ? AND next_due = ?
         ${CURRENT_ORDER}
         LIMIT 1`,
      )
      .bind(taskId, nextDue)
      .first<Row>();
    return row ? rowToRecord(row) : null;
  }

  async findCurrentByTasks(taskIds: MaintenanceTaskId[]): Promise<ScheduledReminderRecord[]> {
    if (taskIds.length === 0) return [];
    // Chunked: D1 caps bound parameters per statement at 100, and the task set
    // scales with every visible asset's tasks.
    const chunkSize = 90;
    const latest: ScheduledReminderRecord[] = [];
    for (let start = 0; start < taskIds.length; start += chunkSize) {
      const chunk = taskIds.slice(start, start + chunkSize);
      const result = await this.db
        .prepare(
          `SELECT ${COLUMNS} FROM scheduled_reminders
           WHERE maintenance_task_id IN (${placeholders(chunk.length)})
           ${CURRENT_ORDER}`,
        )
        .bind(...chunk)
        .all<Row>();
      latest.push(...(result.results ?? []).map(rowToRecord));
    }
    return latestPerTask(latest);
  }

  async findDue(today: string): Promise<ScheduledReminderRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${COLUMNS} FROM scheduled_reminders
         WHERE status = 'pending' AND fire_at <= ?
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY owner_id, id`,
      )
      .bind(today, today)
      .all<Row>();
    return (result.results ?? []).map(rowToRecord);
  }

  async updateStatus(
    id: ScheduledReminderId,
    status: ScheduledReminderStatus,
    updatedAt: Date,
  ): Promise<void> {
    // Every transition other than a snooze drops the snooze with the cycle, so
    // a stale snooze never resurrects on a superseded or reactivated row.
    await this.db
      .prepare(
        `UPDATE scheduled_reminders
         SET status = ?, snoozed_until = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(status, updatedAt.toISOString(), id)
      .run();
  }

  async updateSnapshot(
    id: ScheduledReminderId,
    snapshot: Pick<ScheduledReminderRecord, "assetName" | "assetType" | "taskTitle" | "actorId">,
    provenance: Pick<ScheduledReminderRecord, "lastEventId" | "lastEventOccurredAt">,
    updatedAt: Date,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE scheduled_reminders
         SET asset_name = ?, asset_type = ?, task_title = ?, actor_id = ?,
             last_event_id = ?, last_event_occurred_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        snapshot.assetName,
        snapshot.assetType,
        snapshot.taskTitle,
        snapshot.actorId,
        provenance.lastEventId,
        provenance.lastEventOccurredAt.toISOString(),
        updatedAt.toISOString(),
        id,
      )
      .run();
  }

  async snooze(
    id: ScheduledReminderId,
    expectedStatus: ScheduledReminderStatus,
    snoozedUntil: string,
    updatedAt: Date,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE scheduled_reminders
         SET status = 'pending', snoozed_until = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .bind(snoozedUntil, updatedAt.toISOString(), id, expectedStatus)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async snoozedUntilByTask(taskIds: MaintenanceTaskId[]): Promise<Map<MaintenanceTaskId, string>> {
    const current = await this.findCurrentByTasks(taskIds);
    const byTask = new Map<MaintenanceTaskId, string>();
    for (const record of current) {
      if (record.snoozedUntil !== null) byTask.set(record.maintenanceTaskId, record.snoozedUntil);
    }
    return byTask;
  }
}

/** The latest row per task from a CURRENT_ORDER-ordered result set. */
function latestPerTask(records: ScheduledReminderRecord[]): ScheduledReminderRecord[] {
  const seen = new Set<MaintenanceTaskId>();
  const latest: ScheduledReminderRecord[] = [];
  for (const record of records) {
    if (seen.has(record.maintenanceTaskId)) continue;
    seen.add(record.maintenanceTaskId);
    latest.push(record);
  }
  return latest;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
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
    snoozedUntil: row.snoozed_until,
    status: row.status as ScheduledReminderStatus,
    lastEventId: row.last_event_id,
    lastEventOccurredAt: new Date(row.last_event_occurred_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
