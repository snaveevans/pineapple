import { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { prepareActivityOutboxInsert } from "../activity/D1ActivityOutboxRepository.ts";

type AssetRow = {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  metadata: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  shared_team_id: string | null;
};

const SELECT_COLUMNS =
  "id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id";

export class D1AssetRepository implements AssetRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: AssetId): Promise<Asset | null> {
    const row = await this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM assets WHERE id = ?`)
      .bind(id)
      .first<AssetRow>();
    return row ? this.#rowToAsset(row) : null;
  }

  async findVisibleTo(userId: UserId): Promise<Asset[]> {
    const result = await this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM assets
         WHERE owner_id = ?
            OR shared_team_id IN (
                 SELECT team_id FROM team_members WHERE user_id = ?
               )`,
      )
      .bind(userId, userId)
      .all<AssetRow>();
    return result.results.map((row) => this.#rowToAsset(row));
  }

  async save(asset: Asset, events: readonly DomainEvent[] = []): Promise<void> {
    const assetStatement = this.db
      .prepare(
        `INSERT INTO assets (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name           = excluded.name,
           metadata       = excluded.metadata,
           archived_at    = excluded.archived_at,
           updated_at     = excluded.updated_at,
           shared_team_id = excluded.shared_team_id`,
      )
      .bind(
        asset.id,
        asset.ownerId,
        asset.name,
        asset.type,
        JSON.stringify(asset.metadata),
        asset.archivedAt?.toISOString() ?? null,
        asset.createdAt.toISOString(),
        asset.updatedAt.toISOString(),
        asset.sharedTeamId,
      );

    const outboxStatements = events
      .map((event) => prepareActivityOutboxInsert(this.db, event))
      .filter((statement): statement is D1PreparedStatement => statement !== null);

    if (outboxStatements.length === 0) {
      await assetStatement.run();
      return;
    }

    await this.db.batch([assetStatement, ...outboxStatements]);
  }

  #rowToAsset(row: AssetRow): Asset {
    return Asset.reconstitute({
      id: AssetId.from(row.id),
      ownerId: UserId.from(row.owner_id),
      name: row.name,
      metadata: JSON.parse(row.metadata) as AssetMetadata,
      archivedAt: row.archived_at ? new Date(row.archived_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      sharedTeamId: row.shared_team_id ? TeamId.from(row.shared_team_id) : null,
    });
  }
}
