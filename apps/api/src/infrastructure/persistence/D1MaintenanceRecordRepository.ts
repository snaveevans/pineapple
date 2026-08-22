import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { MaintenanceRecordWriter } from "../../application/ports/MaintenanceRecordWriter.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import { prepareActivityOutboxInsert } from "../activity/D1ActivityOutboxRepository.ts";
import { prepareNotificationOutboxInsert } from "../notifications/D1NotificationOutboxRepository.ts";
import { prepareMaintenanceTaskSave } from "./D1MaintenanceTaskRepository.ts";

type MaintenanceRecordRow = {
  id: string;
  asset_id: string;
  owner_id: string;
  title: string;
  performed_at: string;
  notes: string | null;
  task_id: string | null;
  created_at: string;
  revision: number;
};

const SELECT_COLUMNS =
  "id, asset_id, owner_id, title, performed_at, notes, task_id, created_at, revision";

export class D1MaintenanceRecordRepository
  implements MaintenanceRecordRepository, MaintenanceRecordWriter
{
  constructor(private readonly db: D1Database) {}

  async findById(id: MaintenanceRecordId): Promise<MaintenanceRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM maintenance_records WHERE id = ?`)
      .bind(id)
      .first<MaintenanceRecordRow>();
    return row ? this.#rowToRecord(row) : null;
  }

  async findByAsset(assetId: AssetId, ownerId: UserId): Promise<MaintenanceRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM maintenance_records
         WHERE asset_id = ? AND owner_id = ?
         ORDER BY performed_at DESC, created_at DESC`,
      )
      .bind(assetId, ownerId)
      .all<MaintenanceRecordRow>();
    return result.results.map((row) => this.#rowToRecord(row));
  }

  async findByTask(taskId: MaintenanceTaskId): Promise<MaintenanceRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM maintenance_records
         WHERE task_id = ?
         ORDER BY performed_at DESC, created_at DESC`,
      )
      .bind(taskId)
      .all<MaintenanceRecordRow>();
    return result.results.map((row) => this.#rowToRecord(row));
  }

  async save(
    record: MaintenanceRecord,
    advancedTask: MaintenanceTask | null = null,
    events: readonly DomainEvent[] = [],
  ): Promise<void> {
    const recordStatement = this.db
      .prepare(
        `INSERT INTO maintenance_records
           (id, asset_id, owner_id, title, performed_at, notes, task_id, created_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.assetId,
        record.ownerId,
        record.title,
        record.performedAt,
        record.notes,
        record.taskId,
        record.createdAt.toISOString(),
        record.revision,
      );

    if (advancedTask === null && events.length === 0) {
      await recordStatement.run();
      return;
    }

    const outboxStatements = events
      .flatMap((event) => [
        prepareActivityOutboxInsert(this.db, event),
        prepareNotificationOutboxInsert(this.db, event),
      ])
      .filter((statement): statement is D1PreparedStatement => statement !== null);

    const statements = [recordStatement];
    if (advancedTask !== null) statements.push(prepareMaintenanceTaskSave(this.db, advancedTask));
    await this.db.batch([...statements, ...outboxStatements]);
  }

  async update(
    record: MaintenanceRecord,
    expectedRecordRevision: number,
    reconciledTask: MaintenanceTask | null = null,
    expectedTaskRevision?: number,
    events: readonly DomainEvent[] = [],
  ): Promise<boolean> {
    const guardStatement = this.db
      .prepare(
        `INSERT INTO mutation_guards (name, assertion)
         VALUES (
           'cas_guard',
           (
             SELECT CASE
               WHEN (SELECT revision FROM maintenance_records WHERE id = ?) = ?
                AND (? IS NULL OR (SELECT revision FROM maintenance_tasks WHERE id = ?) = ?)
               THEN 1
               ELSE 0
             END
           )
         )
         ON CONFLICT(name) DO UPDATE SET assertion = excluded.assertion`,
      )
      .bind(
        record.id,
        expectedRecordRevision,
        reconciledTask ? reconciledTask.id : null,
        reconciledTask ? reconciledTask.id : null,
        expectedTaskRevision !== undefined ? expectedTaskRevision : null,
      );

    const recordStatement = this.db
      .prepare(
        `UPDATE maintenance_records
         SET title = ?, performed_at = ?, notes = ?, revision = ?
         WHERE id = ? AND revision = ?`,
      )
      .bind(
        record.title,
        record.performedAt,
        record.notes,
        record.revision,
        record.id,
        expectedRecordRevision,
      );

    const statements: D1PreparedStatement[] = [guardStatement, recordStatement];

    if (reconciledTask !== null && expectedTaskRevision !== undefined) {
      const taskStatement = this.db
        .prepare(
          `UPDATE maintenance_tasks
           SET last_completed_date = ?, next_due = ?, revision = ?
           WHERE id = ? AND revision = ?`,
        )
        .bind(
          reconciledTask.lastCompletedDate,
          reconciledTask.nextDue,
          reconciledTask.revision,
          reconciledTask.id,
          expectedTaskRevision,
        );
      statements.push(taskStatement);
    }

    const outboxStatements = events
      .flatMap((event) => [
        prepareActivityOutboxInsert(this.db, event),
        prepareNotificationOutboxInsert(this.db, event),
      ])
      .filter((statement): statement is D1PreparedStatement => statement !== null);

    try {
      const results = await this.db.batch([...statements, ...outboxStatements]);
      const recordResult = results[1];
      if (!recordResult || recordResult.meta.changes !== 1) {
        return false;
      }

      if (reconciledTask !== null) {
        const taskResult = results[2];
        if (!taskResult || taskResult.meta.changes !== 1) {
          return false;
        }
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

  async delete(
    record: MaintenanceRecord,
    expectedRecordRevision: number,
    reconciledTask: MaintenanceTask | null = null,
    expectedTaskRevision?: number,
    events: readonly DomainEvent[] = [],
  ): Promise<boolean> {
    const guardStatement = this.db
      .prepare(
        `INSERT INTO mutation_guards (name, assertion)
         VALUES (
           'cas_guard',
           (
             SELECT CASE
               WHEN (SELECT revision FROM maintenance_records WHERE id = ?) = ?
                AND (? IS NULL OR (SELECT revision FROM maintenance_tasks WHERE id = ?) = ?)
               THEN 1
               ELSE 0
             END
           )
         )
         ON CONFLICT(name) DO UPDATE SET assertion = excluded.assertion`,
      )
      .bind(
        record.id,
        expectedRecordRevision,
        reconciledTask ? reconciledTask.id : null,
        reconciledTask ? reconciledTask.id : null,
        expectedTaskRevision !== undefined ? expectedTaskRevision : null,
      );

    const recordStatement = this.db
      .prepare(
        `DELETE FROM maintenance_records
         WHERE id = ? AND revision = ?`,
      )
      .bind(record.id, expectedRecordRevision);

    const statements: D1PreparedStatement[] = [guardStatement, recordStatement];

    if (reconciledTask !== null && expectedTaskRevision !== undefined) {
      const taskStatement = this.db
        .prepare(
          `UPDATE maintenance_tasks
           SET last_completed_date = ?, next_due = ?, revision = ?
           WHERE id = ? AND revision = ?`,
        )
        .bind(
          reconciledTask.lastCompletedDate,
          reconciledTask.nextDue,
          reconciledTask.revision,
          reconciledTask.id,
          expectedTaskRevision,
        );
      statements.push(taskStatement);
    }

    const outboxStatements = events
      .flatMap((event) => [
        prepareActivityOutboxInsert(this.db, event),
        prepareNotificationOutboxInsert(this.db, event),
      ])
      .filter((statement): statement is D1PreparedStatement => statement !== null);

    try {
      const results = await this.db.batch([...statements, ...outboxStatements]);
      const recordResult = results[1];
      if (!recordResult || recordResult.meta.changes !== 1) {
        return false;
      }

      if (reconciledTask !== null) {
        const taskResult = results[2];
        if (!taskResult || taskResult.meta.changes !== 1) {
          return false;
        }
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

  #rowToRecord(row: MaintenanceRecordRow): MaintenanceRecord {
    if (row.revision === null || row.revision === undefined) {
      throw new Error(`Invariant violation: record ${row.id} has null revision after rollout`);
    }

    return MaintenanceRecord.reconstitute({
      id: MaintenanceRecordId.from(row.id),
      assetId: AssetId.from(row.asset_id),
      ownerId: UserId.from(row.owner_id),
      title: row.title,
      performedAt: row.performed_at,
      notes: row.notes,
      taskId: row.task_id ? MaintenanceTaskId.from(row.task_id) : null,
      createdAt: new Date(row.created_at),
      revision: row.revision,
    });
  }
}
