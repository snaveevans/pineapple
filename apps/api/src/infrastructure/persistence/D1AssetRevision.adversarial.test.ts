import { DatabaseSync } from "node:sqlite";
import { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { Asset } from "../../domain/asset/Asset.ts";
import { D1AssetRepository } from "./D1AssetRepository.ts";
// @ts-expect-error Vitest's Vite pipeline loads the real migration as source text.
import assetRevisionMigrationSql from "../../../../../migrations/0025_asset_agent_revision.sql?raw";

const OWNER_ID = "2f2664a9-3b56-4dab-aeb5-c4d6e1a39b9e";
const ASSET_ID = "ee79a3ae-e2d2-45e9-aa02-b20989a9ec89";
const CREATED_AT = "2026-09-01T12:00:00.000Z";
const EQUIPMENT = { kind: "equipment", manufacturer: "Honda" } as const;

describe("D1 asset revision persistence adversarial contract", () => {
  it.each(["empty", "populated"] as const)(
    "adds the nullable revision to an %s legacy database without changing old asset data",
    async (population) => {
      const sqlite = createLegacyDatabase();
      if (population === "populated") seedLegacyAsset(sqlite);

      applyAssetRevisionMigration(sqlite);

      const repository = new D1AssetRepository(new SqliteD1Database(sqlite));
      if (population === "populated") {
        const row = readRawAsset(sqlite, ASSET_ID);
        expect(row).toMatchObject({
          id: ASSET_ID,
          owner_id: OWNER_ID,
          name: "Legacy generator",
          type: "equipment",
          metadata: JSON.stringify(EQUIPMENT),
          archived_at: null,
          created_at: CREATED_AT,
          updated_at: CREATED_AT,
          shared_team_id: null,
          revision: null,
        });
        const loaded = await repository.findById(AssetId.from(ASSET_ID));
        expect(loaded).toMatchObject({ revision: 0, name: "Legacy generator" });
        expect(readRawAsset(sqlite, ASSET_ID)?.revision).toBeNull();
      } else {
        expect(
          sqlite
            .prepare(
              "SELECT COUNT(*) AS count FROM pragma_table_info('assets') WHERE name = 'revision'",
            )
            .get()?.count,
        ).toBe(1);
        const created = Asset.create({
          ownerId: UserId.from(OWNER_ID),
          name: "New equipment",
          metadata: EQUIPMENT,
        });
        await repository.save(created);
        expect(readRawAsset(sqlite, created.id)?.revision).toBe(0);
        expect((await repository.findById(created.id))?.revision).toBe(0);
      }
    },
  );

  it("keeps persisted revisions monotonic across a legacy-null row and stale last-write-wins saves", async () => {
    const sqlite = createLegacyDatabase();
    seedLegacyAsset(sqlite);
    applyAssetRevisionMigration(sqlite);
    const repository = new D1AssetRepository(new SqliteD1Database(sqlite));
    const current = await repository.findById(AssetId.from(ASSET_ID));
    const stale = await repository.findById(AssetId.from(ASSET_ID));
    expect(current?.revision).toBe(0);
    expect(stale?.revision).toBe(0);
    if (current === null || stale === null) throw new Error("Expected the seeded legacy asset");

    current.edit({
      name: "Current writer",
      metadata: current.metadata,
      actorId: UserId.from(OWNER_ID),
    });
    await repository.save(current);
    expect(readRawAsset(sqlite, ASSET_ID)?.revision).toBe(1);

    stale.edit({
      name: "Last writer wins",
      metadata: stale.metadata,
      actorId: UserId.from(OWNER_ID),
    });
    await repository.save(stale);
    expect(readRawAsset(sqlite, ASSET_ID)).toMatchObject({
      name: "Last writer wins",
      revision: 2,
    });

    const noOp = await repository.findById(AssetId.from(ASSET_ID));
    expect(noOp?.revision).toBe(2);
    if (noOp === null) throw new Error("Expected the persisted asset");
    noOp.edit({ name: noOp.name, metadata: noOp.metadata, actorId: UserId.from(OWNER_ID) });
    await repository.save(noOp);
    expect(readRawAsset(sqlite, ASSET_ID)?.revision).toBe(2);
    expect((await repository.findById(AssetId.from(ASSET_ID)))?.revision).toBe(2);
  });

  it("advances database revisions for real share/unshare writes without changing unrelated rows", async () => {
    const sqlite = createLegacyDatabase();
    applyAssetRevisionMigration(sqlite);
    const repository = new D1AssetRepository(new SqliteD1Database(sqlite));
    const first = Asset.create({
      ownerId: UserId.from(OWNER_ID),
      name: "First",
      metadata: EQUIPMENT,
    });
    const second = Asset.create({
      ownerId: UserId.from(OWNER_ID),
      name: "Second",
      metadata: EQUIPMENT,
    });
    await repository.save(first);
    await repository.save(second);

    const teamId = TeamId.generate();
    first.shareToTeam({ teamId, teamName: "Field Ops", actorId: UserId.from(OWNER_ID) });
    await repository.save(first);
    expect(readRawAsset(sqlite, first.id)?.revision).toBe(1);
    expect(readRawAsset(sqlite, second.id)?.revision).toBe(0);

    first.unshare({ teamId, teamName: "Field Ops", actorId: UserId.from(OWNER_ID) });
    await repository.save(first);
    expect(readRawAsset(sqlite, first.id)?.revision).toBe(2);
    expect(readRawAsset(sqlite, second.id)?.revision).toBe(0);
  });
});

function createLegacyDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (id TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE assets (
      id TEXT NOT NULL PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      shared_team_id TEXT
    );
  `);
  sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(OWNER_ID);
  return sqlite;
}

function applyAssetRevisionMigration(sqlite: DatabaseSync): void {
  if (typeof assetRevisionMigrationSql !== "string") {
    throw new Error("Expected Vite to load the asset revision migration as text");
  }
  sqlite.exec(assetRevisionMigrationSql);
}

function seedLegacyAsset(sqlite: DatabaseSync): void {
  sqlite
    .prepare(
      `INSERT INTO assets
       (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    )
    .run(
      ASSET_ID,
      OWNER_ID,
      "Legacy generator",
      "equipment",
      JSON.stringify(EQUIPMENT),
      CREATED_AT,
      CREATED_AT,
    );
}

function readRawAsset(
  sqlite: DatabaseSync,
  assetId: AssetId | string,
): Record<string, unknown> | undefined {
  const row = sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
  return row === undefined ? undefined : row;
}

class SqliteD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, query);
  }

  batch<T = unknown>(_statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    void _statements;
    return Promise.reject(new Error("batch is not used by this test adapter"));
  }

  exec(): Promise<D1ExecResult> {
    return Promise.reject(new Error("exec is not used by this test adapter"));
  }

  withSession(): D1DatabaseSession {
    throw new Error("withSession is not used by this test adapter");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(new Error("dump is not used by this test adapter"));
  }
}

class SqliteD1PreparedStatement {
  #values: unknown[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.#values = values;
    return this;
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.#prepared().get(...toSqlValues(this.#values));
    if (row === undefined) return Promise.resolve(null);
    if (columnName !== undefined) {
      const value = row[columnName];
      return Promise.resolve(value === undefined || value === null ? null : (value as T));
    }
    return Promise.resolve(row as T);
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve({
      success: true,
      meta: emptyMeta(),
      results: this.#prepared().all(...toSqlValues(this.#values)) as T[],
    });
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const prepared = this.#prepared();
    const rows = prepared.all(...toSqlValues(this.#values));
    if (options?.columnNames) {
      const names = prepared.columns().map((column) => column.name);
      return Promise.resolve([names, ...rows.map((row) => Object.values(row))] as [
        string[],
        ...T[],
      ]);
    }
    return Promise.resolve(rows.map((row) => Object.values(row)) as T[]);
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.#prepared().run(...toSqlValues(this.#values));
    return Promise.resolve({
      success: true,
      meta: {
        ...emptyMeta(),
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
    });
  }

  #prepared(): ReturnType<DatabaseSync["prepare"]> {
    return this.sqlite.prepare(this.query);
  }
}

function emptyMeta(): D1Meta & Record<string, unknown> {
  return {
    changes: 0,
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
  };
}

function toSqlValues(values: unknown[]): (string | number | bigint | Uint8Array | null)[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (value instanceof Date) return value.toISOString();
    throw new Error("Unsupported SQLite test parameter");
  });
}
