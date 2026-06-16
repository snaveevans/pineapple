import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { IntervalUnit } from "../../domain/maintenance/IntervalUnit.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";

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
};

const SELECT_COLUMNS =
  "id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due, created_at";

export function prepareMaintenanceTaskSave(
  db: D1Database,
  task: MaintenanceTask,
): D1PreparedStatement {
  // ON CONFLICT only updates the mutable tracking fields (last_completed_date, next_due).
  // title, interval_value, and interval_unit are immutable after creation; no update path exists.
  return db
    .prepare(
      `INSERT INTO maintenance_tasks
         (id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_completed_date = excluded.last_completed_date,
         next_due = excluded.next_due`,
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
    );
}

export class D1MaintenanceTaskRepository implements MaintenanceTaskRepository {
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

  async findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null> {
    const row = await this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM maintenance_tasks WHERE id = ?`)
      .bind(id)
      .first<MaintenanceTaskRow>();
    return row ? this.#rowToTask(row) : null;
  }

  async save(task: MaintenanceTask): Promise<void> {
    await prepareMaintenanceTaskSave(this.db, task).run();
  }

  async delete(taskId: MaintenanceTaskId): Promise<void> {
    await this.db.batch([
      this.db
        .prepare("UPDATE maintenance_records SET task_id = NULL WHERE task_id = ?")
        .bind(taskId),
      this.db.prepare("DELETE FROM maintenance_tasks WHERE id = ?").bind(taskId),
    ]);
  }

  #rowToTask(row: MaintenanceTaskRow): MaintenanceTask {
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
    });
  }
}
