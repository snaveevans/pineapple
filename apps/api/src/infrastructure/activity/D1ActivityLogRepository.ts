import { ActivityEntryId, AssetId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import {
  ACTIVITY_ENTRY_TYPES,
  type ActivityAssetFilter,
  type ActivityEntry,
  type ActivityEntryType,
  type ActivityReadModel,
  type ActivityTypeFilter,
} from "../../domain/activity/ActivityEntry.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type {
  ActivityLogQuery,
  ActivityLogRepository,
} from "../../application/ports/ActivityLogRepository.ts";
import type { ActivityEventMessage } from "./ActivityEventMessage.ts";

type ActivityEntryRow = {
  id: string;
  type: string;
  occurred_at: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  title: string | null;
  performed_at: string | null;
};

type ActivityTypeFacetRow = {
  type: string;
  count: number;
};

type ActivityAssetFacetRow = {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  count: number;
};

type DecodedCursor = {
  occurredAt: string;
  id: string;
};

type CursorPayload = DecodedCursor & {
  v: 1;
  type?: ActivityEntryType;
  assetId?: string;
};

const SELECT_COLUMNS =
  "id, type, occurred_at, asset_id, asset_name, asset_type, title, performed_at";

export class D1ActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly db: D1Database) {}

  async list(query: ActivityLogQuery): Promise<ActivityReadModel> {
    const cursor = decodeCursor(query.cursor, query);
    const [entries, typeFilters, assetFilters] = await Promise.all([
      this.fetchEntries(query, cursor),
      this.fetchTypeFilters(query.ownerId),
      this.fetchAssetFilters(query.ownerId),
    ]);

    const visibleEntries = entries.slice(0, query.limit).map(rowToEntry);
    const hasMore = entries.length > query.limit;
    const last = visibleEntries.at(-1);

    return {
      entries: visibleEntries,
      availableFilters: {
        types: typeFilters,
        assets: assetFilters,
      },
      nextCursor: hasMore && last ? encodeCursor(last, query) : null,
    };
  }

  async recordEvent(event: ActivityEventMessage): Promise<void> {
    const entry = entryFromEvent(event);
    if (entry === null) return;

    await this.db
      .prepare(
        `INSERT INTO activity_entries
           (id, source_event_id, owner_id, actor_id, type, occurred_at,
            asset_id, asset_name, asset_type, title, performed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_event_id) DO NOTHING`,
      )
      .bind(
        entry.id,
        event.id,
        event.ownerId,
        event.actorId,
        entry.type,
        entry.occurredAt,
        entry.assetId,
        entry.assetName,
        entry.assetType,
        entry.title,
        entry.performedAt,
        new Date().toISOString(),
      )
      .run();
  }

  private async fetchEntries(
    query: ActivityLogQuery,
    cursor: DecodedCursor | null,
  ): Promise<ActivityEntryRow[]> {
    const conditions = ["owner_id = ?"];
    const values: (string | number)[] = [query.ownerId];

    if (query.type !== undefined) {
      conditions.push("type = ?");
      values.push(query.type);
    }
    if (query.assetId !== undefined) {
      conditions.push("asset_id = ?");
      values.push(query.assetId);
    }
    if (cursor !== null) {
      conditions.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))");
      values.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
    }

    values.push(query.limit + 1);
    const result = await this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM activity_entries
         WHERE ${conditions.join(" AND ")}
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(...values)
      .all<ActivityEntryRow>();
    return result.results;
  }

  private async fetchTypeFilters(ownerId: UserId): Promise<ActivityTypeFilter[]> {
    const result = await this.db
      .prepare(
        `SELECT type, COUNT(*) AS count
         FROM activity_entries
         WHERE owner_id = ?
         GROUP BY type`,
      )
      .bind(ownerId)
      .all<ActivityTypeFacetRow>();

    const byType = new Map(result.results.map((row) => [row.type, row.count]));
    return ACTIVITY_ENTRY_TYPES.flatMap((type) => {
      const count = byType.get(type) ?? 0;
      return count > 0 ? [{ type, count }] : [];
    });
  }

  private async fetchAssetFilters(ownerId: UserId): Promise<ActivityAssetFilter[]> {
    const result = await this.db
      .prepare(
        `SELECT asset_id, asset_name, asset_type, count
         FROM (
           SELECT asset_id,
                  asset_name,
                  asset_type,
                  COUNT(*) OVER (PARTITION BY asset_id) AS count,
                  ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY occurred_at DESC, id DESC) AS rn
           FROM activity_entries
           WHERE owner_id = ?
         )
         WHERE rn = 1
         ORDER BY asset_name COLLATE NOCASE ASC, asset_id ASC`,
      )
      .bind(ownerId)
      .all<ActivityAssetFacetRow>();

    return result.results.map((row) => ({
      asset: {
        id: AssetId.from(row.asset_id),
        name: row.asset_name,
        type: row.asset_type as AssetType,
      },
      count: row.count,
    }));
  }
}

function entryFromEvent(event: ActivityEventMessage): {
  id: string;
  type: ActivityEntryType;
  occurredAt: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  title: string | null;
  performedAt: string | null;
} | null {
  if (event.activityEntryType === null) return null;

  const base = {
    id: ActivityEntryId.from(event.id),
    occurredAt: event.occurredAt,
    assetId: event.assetId,
    assetName: event.assetName,
    assetType: event.assetType,
  };

  switch (event.type) {
    case "AssetCreated":
      return { ...base, type: event.activityEntryType, title: null, performedAt: null };
    case "MaintenanceRecordCreated":
      return {
        ...base,
        type: event.activityEntryType,
        title: event.title,
        performedAt: event.performedAt,
      };
    case "MaintenanceTaskAdvanced":
      return {
        ...base,
        type: event.activityEntryType,
        title: event.title,
        performedAt: event.performedAt,
      };
    case "MaintenanceTaskCreated":
      return { ...base, type: event.activityEntryType, title: event.title, performedAt: null };
    case "MaintenanceTaskDeleted":
      return { ...base, type: event.activityEntryType, title: event.title, performedAt: null };
  }
}

function rowToEntry(row: ActivityEntryRow): ActivityEntry {
  return {
    id: ActivityEntryId.from(row.id),
    type: row.type as ActivityEntryType,
    occurredAt: new Date(row.occurred_at),
    asset: {
      id: AssetId.from(row.asset_id),
      name: row.asset_name,
      type: row.asset_type as AssetType,
    },
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.performed_at !== null ? { performedAt: row.performed_at } : {}),
  };
}

function encodeCursor(entry: ActivityEntry, query: ActivityLogQuery): string {
  const payload: CursorPayload = {
    v: 1,
    occurredAt: entry.occurredAt.toISOString(),
    id: entry.id,
    ...(query.type !== undefined ? { type: query.type } : {}),
    ...(query.assetId !== undefined ? { assetId: query.assetId } : {}),
  };
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeCursor(cursor: string | undefined, query: ActivityLogQuery): DecodedCursor | null {
  if (cursor === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(atob(toBase64(cursor)));
    if (!isCursorPayload(parsed)) throw new Error("Malformed cursor");

    const expectedType = query.type ?? undefined;
    const expectedAssetId = query.assetId ?? undefined;
    if (parsed.type !== expectedType || parsed.assetId !== expectedAssetId) {
      throw new ValidationError("Cursor does not match the requested filters", "cursor");
    }

    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Cursor is malformed", "cursor");
  }
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === 1 &&
    typeof record.occurredAt === "string" &&
    typeof record.id === "string" &&
    (record.type === undefined ||
      ACTIVITY_ENTRY_TYPES.includes(record.type as ActivityEntryType)) &&
    (record.assetId === undefined || typeof record.assetId === "string")
  );
}

function toBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return `${normalized}${"=".repeat(padding)}`;
}
