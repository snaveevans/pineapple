import { DatabaseSync } from "node:sqlite";
import { ConflictError, InvariantError, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { AgentJournalCommit, AgentRowChange } from "./AgentJournalTypes.ts";
import { D1AgentOperationJournal } from "./D1AgentOperationJournal.ts";

const ACTOR = "239f68c0-c6a2-4550-8c5b-30e0f66fe7e2";
const OPERATION_ID = "188e5572-a712-4b1d-9f67-a260214ef953";
const STREET = "321 Hidden Street";
const RAW_INPUT = "serialized MCP payload with a private notes canary";

describe("D1 agent operation journal retry safety", () => {
  it("replays a reordered JSON object without applying staged writes twice", async () => {
    const { sqlite, db } = createDatabase();
    const before = assetSnapshot("Before", 0);
    seedAsset(sqlite, before);
    const journal = new D1AgentOperationJournal(db);
    const originalInput = {
      assetId: before.id,
      patch: { name: "After", metadata: { manufacturer: "Honda", kind: "equipment" } },
      labels: ["fleet", "winter"],
    };
    const firstRequest = commitRequest(db, originalInput, before, assetSnapshot("After", 1));

    const firstReceipt = await journal.commit(firstRequest);
    const reorderedInput = {
      labels: ["fleet", "winter"],
      patch: { metadata: { kind: "equipment", manufacturer: "Honda" }, name: "After" },
      assetId: before.id,
    };
    const retry = commitRequest(db, reorderedInput, before, assetSnapshot("Would overwrite", 99));

    await expect(journal.commit(retry)).resolves.toEqual({ ...firstReceipt, replayed: true });

    expect(readAsset(sqlite)).toEqual(assetSnapshot("After", 1));
    expect(count(sqlite, "activity_event_outbox")).toBe(1);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
  });

  it.each([
    [
      "absent and null values",
      { assetId: "asset-1", patch: { name: "After" } },
      { assetId: "asset-1", patch: { name: "After", nickname: null } },
    ],
    [
      "array order",
      { assetId: "asset-1", labels: ["fleet", "winter"] },
      { assetId: "asset-1", labels: ["winter", "fleet"] },
    ],
  ])(
    "conflicts on %s while preserving the original state and receipt",
    async (_case, input, changed) => {
      const { sqlite, db } = createDatabase();
      const before = assetSnapshot("Before", 0);
      seedAsset(sqlite, before);
      const journal = new D1AgentOperationJournal(db);
      const original = commitRequest(db, input, before, assetSnapshot("After", 1));
      const receipt = await journal.commit(original);
      const storedBeforeRetry = sqlite.prepare("SELECT * FROM agent_operation_journal").get();
      const retry = commitRequest(db, changed, before, assetSnapshot("Must not apply", 2));

      await expect(journal.commit(retry)).rejects.toBeInstanceOf(ConflictError);

      expect(readAsset(sqlite)).toEqual(assetSnapshot("After", 1));
      expect(count(sqlite, "activity_event_outbox")).toBe(1);
      expect(count(sqlite, "agent_operation_journal")).toBe(1);
      expect(sqlite.prepare("SELECT * FROM agent_operation_journal").get()).toEqual(
        storedBeforeRetry,
      );
      await expect(journal.find(ACTOR, OPERATION_ID)).resolves.toMatchObject({
        receipt: {
          operationId: receipt.operationId,
          entityType: receipt.entityType,
          entityId: receipt.entityId,
          assetId: receipt.assetId,
          appliedRevision: receipt.appliedRevision,
        },
      });
    },
  );

  it("maps arbitrary storage errors to a safe generic error after all writes roll back", async () => {
    const { sqlite } = createDatabase();
    const before = assetSnapshot("Before", 0);
    seedAsset(sqlite, before);
    const privateError = `SQLite failure: ${STREET}; request=${RAW_INPUT}`;
    const noisyDb = new ErrorTextOnBatchFailureDatabase(sqlite, privateError);
    const request = commitRequest(
      noisyDb,
      { assetId: before.id, patch: { name: "After", notes: RAW_INPUT } },
      before,
      assetSnapshot("After", 1),
    );
    request.statements.push(
      noisyDb.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
      noisyDb.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const thrown = await new D1AgentOperationJournal(noisyDb).commit(request).then(
        () => null,
        (error: unknown) => error,
      );

      expect(thrown).toBeInstanceOf(InvariantError);
      expect(thrown).toBeInstanceOf(Error);
      if (thrown instanceof Error) {
        expect(thrown.message).not.toContain(STREET);
        expect(thrown.message).not.toContain(RAW_INPUT);
        expect(thrown.message).not.toContain(privateError);
      }
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(readAsset(sqlite)).toEqual(before);
      expect(count(sqlite, "activity_event_outbox")).toBe(0);
      expect(count(sqlite, "agent_operation_journal")).toBe(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps malformed stored evidence errors generic and does not log snapshots", async () => {
    const { sqlite, db } = createDatabase();
    const before = assetSnapshot("Before", 0);
    seedAsset(sqlite, before);
    const journal = new D1AgentOperationJournal(db);
    const request = commitRequest(db, { assetId: before.id }, before, assetSnapshot("After", 1));
    await journal.commit(request);
    const corrupted = JSON.stringify({
      version: 1,
      changes: [
        {
          table: "assets",
          id: before.id,
          before: { id: before.id, private_snapshot: STREET },
          after: assetSnapshot("After", 1),
        },
      ],
    });
    sqlite
      .prepare("UPDATE agent_operation_journal SET snapshots_json = ? WHERE actor_id = ?")
      .run(corrupted, ACTOR);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const thrown = await journal.commit(request).then(
        () => null,
        (error: unknown) => error,
      );

      expect(thrown).toBeInstanceOf(InvariantError);
      expect(thrown).toBeInstanceOf(Error);
      if (thrown instanceof Error) {
        expect(thrown.message).not.toContain(STREET);
        expect(thrown.message).not.toContain("Unexpected token");
      }
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(readAsset(sqlite)).toEqual(assetSnapshot("After", 1));
      expect(count(sqlite, "activity_event_outbox")).toBe(1);
      expect(count(sqlite, "agent_operation_journal")).toBe(1);
      expect(sqlite.prepare("SELECT snapshots_json FROM agent_operation_journal").get()).toEqual({
        snapshots_json: corrupted,
      });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

type AssetSnapshot = {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  metadata: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  shared_team_id: string | null;
  revision: number;
};

function assetSnapshot(name: string, revision: number): AssetSnapshot {
  return {
    id: "asset-1",
    owner_id: ACTOR,
    name,
    type: "equipment",
    metadata: JSON.stringify({ kind: "equipment", manufacturer: "Honda", street: STREET }),
    archived_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    shared_team_id: null,
    revision,
  };
}

function createDatabase(): { sqlite: DatabaseSync; db: SqliteD1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      shared_team_id TEXT,
      revision INTEGER
    );
    CREATE TABLE activity_event_outbox (id TEXT PRIMARY KEY);
    CREATE TABLE agent_operation_journal (
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
      snapshot_version INTEGER NOT NULL CHECK (snapshot_version = 1),
      snapshots_json TEXT NOT NULL CHECK (json_valid(snapshots_json)),
      created_at TEXT NOT NULL,
      restored_at TEXT,
      PRIMARY KEY (actor_id, operation_id)
    );
  `);
  sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(ACTOR);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

function seedAsset(sqlite: DatabaseSync, asset: AssetSnapshot): void {
  sqlite
    .prepare(
      `INSERT INTO assets
       (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      asset.id,
      asset.owner_id,
      asset.name,
      asset.type,
      asset.metadata,
      asset.archived_at,
      asset.created_at,
      asset.updated_at,
      asset.shared_team_id,
      asset.revision,
    );
}

function commitRequest(
  db: D1Database,
  input: unknown,
  before: AssetSnapshot,
  after: AssetSnapshot,
): AgentJournalCommit {
  const change: AgentRowChange = { table: "assets", id: before.id, before, after };
  return {
    actorId: UserId.from(ACTOR),
    operationId: OPERATION_ID,
    tool: "edit_asset",
    input,
    receipt: {
      operationId: OPERATION_ID,
      entityType: "asset",
      entityId: before.id,
      assetId: before.id,
      appliedRevision: after.revision,
    },
    changes: [change],
    statements: [
      db
        .prepare("UPDATE assets SET name = ?, metadata = ?, revision = ? WHERE id = ?")
        .bind(after.name, after.metadata, after.revision, after.id),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
    ],
  };
}

function readAsset(sqlite: DatabaseSync): AssetSnapshot | undefined {
  const row = sqlite.prepare("SELECT * FROM assets WHERE id = 'asset-1'").get();
  return row === undefined ? undefined : (row as AssetSnapshot);
}

function count(
  sqlite: DatabaseSync,
  table: "activity_event_outbox" | "agent_operation_journal",
): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (row === undefined || typeof row.count !== "number") {
    throw new Error("Expected a SQLite row count");
  }
  return row.count;
}

class SqliteD1Database {
  #batchTail: Promise<void> = Promise.resolve();

  constructor(protected readonly sqlite: DatabaseSync) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const execute = this.#batchTail.then(async () => {
      this.sqlite.exec("BEGIN");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await statement.run<T>());
        this.sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        this.sqlite.exec("ROLLBACK");
        throw error;
      }
    });
    this.#batchTail = execute.then(
      () => undefined,
      () => undefined,
    );
    return execute;
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

class ErrorTextOnBatchFailureDatabase extends SqliteD1Database {
  constructor(
    sqlite: DatabaseSync,
    private readonly errorText: string,
  ) {
    super(sqlite);
  }

  override async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    try {
      return await super.batch<T>(statements);
    } catch {
      throw new Error(this.errorText);
    }
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
      return Promise.resolve(value === null || value === undefined ? null : (value as T));
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

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    if (/^\s*(select|with|pragma)\b/i.test(this.query)) return this.all<T>();
    const result = this.#prepared().run(...toSqlValues(this.#values));
    return {
      success: true,
      meta: {
        ...emptyMeta(),
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
    };
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
