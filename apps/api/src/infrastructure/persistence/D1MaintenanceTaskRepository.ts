import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { IntervalUnit } from "../../domain/maintenance/IntervalUnit.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { MaintenanceTaskWriter } from "../../application/ports/MaintenanceTaskWriter.ts";
import { prepareActivityOutboxInsert } from "../activity/D1ActivityOutboxRepository.ts";
import { prepareNotificationOutboxInsert } from "../notifications/D1NotificationOutboxRepository.ts";

type MaintenanceTaskRow = {
  id: string;
  asset_id: string;
  owner_id: string;
  title: string;
  interval_value: number;
  interval_unit: string;
  last_completed_date: string | null;
  next_due: string;
  created_at: string;
  schedule_seed_date?: string | null;
  initial_last_completed_date?: string | null;
  revision?: number | null;
  next_due_override?: string | null;
};

const SELECT_COLUMNS =
  "id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due, created_at, schedule_seed_date, initial_last_completed_date, revision, next_due_override";

export function prepareMaintenanceTaskSave(
  db: D1Database,
  task: MaintenanceTask,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO maintenance_tasks
         (id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due, created_at, schedule_seed_date, initial_last_completed_date, revision, next_due_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         interval_value = excluded.interval_value,
         interval_unit = excluded.interval_unit,
         last_completed_date = excluded.last_completed_date,
         next_due = excluded.next_due,
         schedule_seed_date = excluded.schedule_seed_date,
         initial_last_completed_date = excluded.initial_last_completed_date,
         revision = excluded.revision,
         next_due_override = excluded.next_due_override`,
    )
    .bind(
      task.id,
      task.assetId,
      task.ownerId,
      task.title,
      task.intervalValue,
      task.intervalUnit,
      task.lastCompletedDate,
      task.nextDue,
      task.createdAt.toISOString(),
      task.scheduleSeedDate,
      task.initialLastCompletedDate,
      task.revision,
      task.nextDueOverride,
    );
}

export class D1MaintenanceTaskRepository
  implements MaintenanceTaskRepository, MaintenanceTaskWriter
{
  constructor(private readonly db: D1Database) {}

  async findByAsset(assetId: AssetId): Promise<MaintenanceTask[]> {
    const result = await this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM maintenance_tasks
         WHERE asset_id = ?
         ORDER BY next_due ASC`,
      )
      .bind(assetId)
      .all<MaintenanceTaskRow>();
    return result.results.map((row) => this.#rowToTask(row));
  }

  async findForVisibleActiveAssets(userId: UserId): Promise<MaintenanceTask[]> {
    const result = await this.db
      .prepare(
        `SELECT t.id, t.asset_id, t.owner_id, t.title, t.interval_value, t.interval_unit,
                t.last_completed_date, t.next_due, t.created_at, t.schedule_seed_date,
                t.initial_last_completed_date, t.revision, t.next_due_override
         FROM maintenance_tasks t
         INNER JOIN assets a ON a.id = t.asset_id
         WHERE a.archived_at IS NULL
           AND (
             a.owner_id = ?
             OR a.shared_team_id IN (
                  SELECT team_id FROM team_members WHERE user_id = ?
                )
           )
         ORDER BY t.next_due ASC, t.created_at ASC`,
      )
      .bind(userId, userId)
      .all<MaintenanceTaskRow>();
    return result.results.map((row) => this.#rowToTask(row));
  }

  async findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null> {
    const row = await this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM maintenance_tasks WHERE id = ?`)
      .bind(id)
      .first<MaintenanceTaskRow>();
    return row ? this.#rowToTask(row) : null;
  }

  async save(task: MaintenanceTask, events: readonly DomainEvent[] = []): Promise<void> {
    const taskStatement = prepareMaintenanceTaskSave(this.db, task);
    const outboxStatements = prepareOutboxInserts(this.db, events);

    if (outboxStatements.length === 0) {
      await taskStatement.run();
      return;
    }

    await this.db.batch([taskStatement, ...outboxStatements]);
  }

  async delete(taskId: MaintenanceTaskId, events: readonly DomainEvent[] = []): Promise<void> {
    const unlinkStatement = this.db
      .prepare(
        "UPDATE maintenance_records SET task_id = NULL, revision = revision + 1 WHERE task_id = ?",
      )
      .bind(taskId);

    const deleteStatement = this.db
      .prepare("DELETE FROM maintenance_tasks WHERE id = ?")
      .bind(taskId);

    const outboxStatements = prepareOutboxInserts(this.db, events);

    await this.db.batch([unlinkStatement, deleteStatement, ...outboxStatements]);
  }

  async updateWithRevision(
    task: MaintenanceTask,
    expectedTaskRevision: number,
    events: readonly DomainEvent[] = [],
  ): Promise<boolean> {
    const guardStatement = this.db
      .prepare(
        `INSERT INTO mutation_guards (name, assertion)
         VALUES (
           'cas_guard',
           (
             SELECT CASE
               WHEN (SELECT revision FROM maintenance_tasks WHERE id = ?) = ?
               THEN 1
               ELSE 0
             END
           )
         )
         ON CONFLICT(name) DO UPDATE SET assertion = excluded.assertion`,
      )
      .bind(task.id, expectedTaskRevision);

    const taskStatement = this.db
      .prepare(
        `UPDATE maintenance_tasks
         SET title = ?, interval_value = ?, interval_unit = ?, last_completed_date = ?,
             next_due = ?, schedule_seed_date = ?, initial_last_completed_date = ?,
             revision = ?, next_due_override = ?
         WHERE id = ? AND revision = ?`,
      )
      .bind(
        task.title,
        task.intervalValue,
        task.intervalUnit,
        task.lastCompletedDate,
        task.nextDue,
        task.scheduleSeedDate,
        task.initialLastCompletedDate,
        task.revision,
        task.nextDueOverride,
        task.id,
        expectedTaskRevision,
      );

    const outboxStatements = prepareOutboxInserts(this.db, events);

    try {
      const results = await this.db.batch([guardStatement, taskStatement, ...outboxStatements]);
      const taskResult = results[1];
      if (!taskResult || taskResult.meta.changes !== 1) {
        return false;
      }
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("CHECK constraint failed") ||
          error.message.includes("assertion = 1") ||
          error.message.includes("D1_ERROR"))
      ) {
        return false;
      }
      throw error;
    }
  }

  #rowToTask(row: MaintenanceTaskRow): MaintenanceTask {
    if (row.schedule_seed_date === null || row.schedule_seed_date === undefined) {
      throw new Error(
        `Invariant violation: task ${row.id} has null schedule_seed_date after rollout`,
      );
    }
    if (row.revision === null || row.revision === undefined) {
      throw new Error(`Invariant violation: task ${row.id} has null revision after rollout`);
    }

    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.from(row.id),
      assetId: AssetId.from(row.asset_id),
      ownerId: UserId.from(row.owner_id),
      title: row.title,
      intervalValue: row.interval_value,
      intervalUnit: row.interval_unit as IntervalUnit,
      lastCompletedDate: row.last_completed_date,
      nextDue: row.next_due,
      createdAt: new Date(row.created_at),
      scheduleSeedDate: row.schedule_seed_date,
      initialLastCompletedDate: row.initial_last_completed_date ?? null,
      revision: row.revision,
      nextDueOverride: row.next_due_override ?? null,
    });
  }
}

/** Fans each event out to the activity and notification outboxes in one batch. */
function prepareOutboxInserts(
  db: D1Database,
  events: readonly DomainEvent[],
): D1PreparedStatement[] {
  return events
    .flatMap((event) => [
      prepareActivityOutboxInsert(db, event),
      prepareNotificationOutboxInsert(db, event),
    ])
    .filter((statement): statement is D1PreparedStatement => statement !== null);
}
