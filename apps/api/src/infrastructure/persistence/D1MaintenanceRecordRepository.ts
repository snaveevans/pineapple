import { AssetId, MaintenanceRecordId, UserId } from "@snaveevans/pineapple-shared";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";

type MaintenanceRecordRow = {
  id: string;
  asset_id: string;
  owner_id: string;
  title: string;
  performed_at: string;
  notes: string | null;
  created_at: string;
};

const SELECT_COLUMNS = "id, asset_id, owner_id, title, performed_at, notes, created_at";

export class D1MaintenanceRecordRepository implements MaintenanceRecordRepository {
  constructor(private readonly db: D1Database) {}

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

  async save(record: MaintenanceRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO maintenance_records
           (id, asset_id, owner_id, title, performed_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.assetId,
        record.ownerId,
        record.title,
        record.performedAt,
        record.notes,
        record.createdAt.toISOString(),
      )
      .run();
  }

  #rowToRecord(row: MaintenanceRecordRow): MaintenanceRecord {
    return MaintenanceRecord.reconstitute({
      id: MaintenanceRecordId.from(row.id),
      assetId: AssetId.from(row.asset_id),
      ownerId: UserId.from(row.owner_id),
      title: row.title,
      performedAt: row.performed_at,
      notes: row.notes,
      createdAt: new Date(row.created_at),
    });
  }
}
