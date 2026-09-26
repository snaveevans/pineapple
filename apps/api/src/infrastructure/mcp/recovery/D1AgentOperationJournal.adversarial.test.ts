import { DatabaseSync } from "node:sqlite";
import { ConflictError, InvariantError, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { AgentJournalCommit, AgentRowChange } from "./AgentJournalTypes.ts";
import { D1AgentOperationJournal, hashAgentInput } from "./D1AgentOperationJournal.ts";

const SCHEMA = `
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
  CREATE TABLE notification_event_outbox (id TEXT PRIMARY KEY);
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
`;

const ACTOR = "239f68c0-c6a2-4550-8c5b-30e0f66fe7e2";
const OPERATION_ID = "188e5572-a712-4b1d-9f67-a260214ef953";
const STREET = "123 Sensitive Street";
const CREATED_AT = "2026-09-01T12:00:00.000Z";

describe("D1AgentOperationJournal adversarial contract", () => {
  it("persists the complete versioned journal envelope while keeping the receipt safe", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const request = commitRequest(db, { before, after });

    const receipt = await new D1AgentOperationJournal(db).commit(request);

    const stored = sqlite.prepare("SELECT * FROM agent_operation_journal").get();
    expect(stored).toMatchObject({
      actor_id: ACTOR,
      operation_id: OPERATION_ID,
      tool: "edit_asset",
      input_hash: await hashAgentInput(request.tool, request.input),
      receipt_json: JSON.stringify(request.receipt),
      snapshot_version: 1,
      restored_at: null,
    });
    expect(typeof stored?.created_at).toBe("string");
    expect(Number.isNaN(Date.parse(String(stored?.created_at)))).toBe(false);
    expect(JSON.parse(String(stored?.snapshots_json))).toEqual({
      version: 1,
      changes: [{ table: "assets", id: before.id, before, after }],
    });
    expect(receipt).toEqual({ ...request.receipt, replayed: false });
    expect(JSON.stringify(receipt)).not.toContain(STREET);
    expect(JSON.stringify(request.receipt)).not.toContain(STREET);
  });

  it("rejects a changed tool under the same actor and operation ID without changing any row", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const original = commitRequest(db, { before, after });
    const journal = new D1AgentOperationJournal(db);
    await journal.commit(original);
    const persistedAsset = readAsset(sqlite);
    const persistedOutboxCount = count(sqlite, "activity_event_outbox");
    const changedTool = commitRequest(db, { before, after });
    changedTool.tool = "create_asset";
    changedTool.statements = [
      db.prepare("UPDATE assets SET name = 'Must not apply' WHERE id = ?").bind(before.id),
    ];

    await expect(journal.commit(changedTool)).rejects.toBeInstanceOf(ConflictError);

    expect(readAsset(sqlite)).toEqual(persistedAsset);
    expect(count(sqlite, "activity_event_outbox")).toBe(persistedOutboxCount);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
    expect(await journal.find(ACTOR, OPERATION_ID)).toMatchObject({ tool: "edit_asset" });
  });

  it.each([
    ["an empty row-change list", []],
    [
      "a row with neither before nor after",
      [{ table: "assets", id: "asset-1", before: null, after: null }],
    ],
    [
      "partial row snapshots",
      [
        {
          table: "assets",
          id: "asset-1",
          before: { id: "asset-1", name: "Before" },
          after: { id: "asset-1", name: "After" },
        },
      ],
    ],
  ])("rejects incomplete recovery evidence: %s", async (_label, changes) => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const request = commitRequest(db, { before, after });
    request.changes = changes as AgentRowChange[];
    request.statements = [
      db
        .prepare("UPDATE assets SET name = ?, revision = ? WHERE id = ?")
        .bind("Must not apply", 8, before.id),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("must-not-commit"),
    ];

    await expect(new D1AgentOperationJournal(db).commit(request)).rejects.toBeInstanceOf(
      InvariantError,
    );

    expect(readAsset(sqlite)).toEqual(before);
    expect(count(sqlite, "activity_event_outbox")).toBe(0);
    expect(count(sqlite, "agent_operation_journal")).toBe(0);
  });

  it("retains complete identical snapshots for a no-op without writing events", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    seedAsset(sqlite, before);
    const request = commitRequest(db, { before, after: before });
    request.input = { assetId: before.id, name: before.name };
    request.receipt = { ...request.receipt, appliedRevision: before.revision };
    request.changes = [{ table: "assets", id: before.id, before, after: before }];
    request.statements = [];

    await expect(new D1AgentOperationJournal(db).commit(request)).resolves.toMatchObject({
      replayed: false,
      appliedRevision: before.revision,
    });

    expect(readAsset(sqlite)).toEqual(before);
    expect(count(sqlite, "activity_event_outbox")).toBe(0);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
    const journal = sqlite.prepare("SELECT snapshots_json FROM agent_operation_journal").get();
    expect(JSON.parse(String(journal?.snapshots_json))).toEqual({
      version: 1,
      changes: [{ table: "assets", id: before.id, before, after: before }],
    });
  });

  it.each([
    ["unknown snapshot version", "version"],
    ["malformed snapshot evidence", "malformed"],
  ])("fails closed on %s without replaying or changing state", async (_label, invalid) => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const request = commitRequest(db, { before, after });
    const journal = new D1AgentOperationJournal(db);
    await journal.commit(request);
    const assetAfterCommit = readAsset(sqlite);
    const journalBeforeCorruption = sqlite.prepare("SELECT * FROM agent_operation_journal").get();
    const outboxCount = count(sqlite, "activity_event_outbox");

    if (invalid === "version") {
      // Simulate corruption or an older journal row despite the current table CHECK.
      sqlite.exec("PRAGMA ignore_check_constraints = ON");
      sqlite
        .prepare(
          "UPDATE agent_operation_journal SET snapshot_version = 7, snapshots_json = ? WHERE actor_id = ? AND operation_id = ?",
        )
        .run(
          JSON.stringify({
            version: 7,
            changes: [{ table: "assets", id: before.id, before, after }],
          }),
          ACTOR,
          OPERATION_ID,
        );
    } else {
      sqlite
        .prepare(
          "UPDATE agent_operation_journal SET snapshots_json = ? WHERE actor_id = ? AND operation_id = ?",
        )
        .run(
          JSON.stringify({
            version: 1,
            changes: [
              {
                table: "assets",
                id: before.id,
                before: { id: before.id, private_payload: STREET },
                after,
              },
            ],
          }),
          ACTOR,
          OPERATION_ID,
        );
    }
    const corruptedJournal = sqlite.prepare("SELECT * FROM agent_operation_journal").get();
    request.statements = [
      db.prepare("UPDATE assets SET name = 'Must not apply' WHERE id = ?").bind(before.id),
    ];

    await expect(journal.commit(request)).rejects.toBeInstanceOf(InvariantError);

    expect(readAsset(sqlite)).toEqual(assetAfterCommit);
    expect(count(sqlite, "activity_event_outbox")).toBe(outboxCount);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
    expect(sqlite.prepare("SELECT * FROM agent_operation_journal").get()).toEqual(corruptedJournal);
    expect(sqlite.prepare("SELECT * FROM agent_operation_journal").get()).not.toEqual(
      journalBeforeCorruption,
    );
    await expect(journal.find(ACTOR, OPERATION_ID)).rejects.toBeInstanceOf(InvariantError);
  });

  it("replays an already-restored operation without undoing the restored state or duplicating outbox", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const request = commitRequest(db, { before, after });
    const journal = new D1AgentOperationJournal(db);
    const firstReceipt = await journal.commit(request);
    sqlite
      .prepare(
        "UPDATE agent_operation_journal SET restored_at = ? WHERE actor_id = ? AND operation_id = ?",
      )
      .run("2026-09-25T18:00:00.000Z", ACTOR, OPERATION_ID);
    sqlite
      .prepare("UPDATE assets SET name = ?, revision = ? WHERE id = ?")
      .run("Before", 9, before.id);
    request.statements = [
      db.prepare("UPDATE assets SET name = 'Must not reapply' WHERE id = ?").bind(before.id),
    ];

    await expect(journal.commit(request)).resolves.toEqual({ ...firstReceipt, replayed: true });

    expect(readAsset(sqlite)).toMatchObject({ name: "Before", revision: 9 });
    expect(count(sqlite, "activity_event_outbox")).toBe(1);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
    expect(await journal.find(ACTOR, OPERATION_ID)).toMatchObject({
      restoredAt: "2026-09-25T18:00:00.000Z",
    });
  });

  it("rolls every staged domain and outbox row back when a later statement fails", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot("Before", 7);
    const after = assetSnapshot("After", 8);
    seedAsset(sqlite, before);
    const beforeCommit = readAsset(sqlite);
    const request = commitRequest(db, { before, after });
    request.statements.push(
      db.prepare("INSERT INTO notification_event_outbox (id) VALUES (?)").bind("notification-1"),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
    );

    await expect(new D1AgentOperationJournal(db).commit(request)).rejects.toThrow();

    expect(readAsset(sqlite)).toEqual(beforeCommit);
    expect(count(sqlite, "activity_event_outbox")).toBe(0);
    expect(count(sqlite, "notification_event_outbox")).toBe(0);
    expect(count(sqlite, "agent_operation_journal")).toBe(0);
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
    type: "property",
    metadata: JSON.stringify({ kind: "property", street: STREET }),
    archived_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    shared_team_id: null,
    revision,
  };
}

function createDatabase(): { sqlite: DatabaseSync; db: SqliteD1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(SCHEMA);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

function seedActor(sqlite: DatabaseSync): void {
  sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(ACTOR);
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
  snapshots: { before: AssetSnapshot; after: AssetSnapshot },
): AgentJournalCommit {
  const change: AgentRowChange = {
    table: "assets",
    id: snapshots.before.id,
    before: snapshots.before,
    after: snapshots.after,
  };
  const receipt = {
    operationId: OPERATION_ID,
    entityType: "asset" as const,
    entityId: snapshots.before.id,
    assetId: snapshots.before.id,
    appliedRevision: snapshots.after.revision,
  };
  return {
    actorId: UserId.from(ACTOR),
    operationId: OPERATION_ID,
    tool: "edit_asset",
    input: { assetId: snapshots.before.id, name: snapshots.after.name },
    receipt,
    changes: [change],
    statements: [
      db
        .prepare("UPDATE assets SET name = ?, revision = ? WHERE id = ?")
        .bind(snapshots.after.name, snapshots.after.revision, snapshots.after.id),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
    ],
  };
}

function readAsset(sqlite: DatabaseSync): AssetSnapshot | undefined {
  const row = sqlite.prepare("SELECT * FROM assets WHERE id = 'asset-1'").get();
  if (row === undefined) return undefined;
  return row as AssetSnapshot;
}

function count(
  sqlite: DatabaseSync,
  table: "activity_event_outbox" | "notification_event_outbox" | "agent_operation_journal",
): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (row === undefined || typeof row.count !== "number") {
    throw new Error("Expected a SQLite row count");
  }
  return row.count;
}

class SqliteD1Database {
  #batchTail: Promise<void> = Promise.resolve();

  constructor(private readonly sqlite: DatabaseSync) {}

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
