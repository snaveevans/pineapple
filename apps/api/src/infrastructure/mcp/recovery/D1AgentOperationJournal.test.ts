import { DatabaseSync } from "node:sqlite";
import { ConflictError, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { AgentJournalCommit, AgentRowChange } from "./AgentJournalTypes.ts";
import { D1AgentOperationJournal, hashAgentInput } from "./D1AgentOperationJournal.ts";

const JOURNAL_SCHEMA = `
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    metadata TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE activity_event_outbox (id TEXT PRIMARY KEY);
  CREATE TABLE mutation_guards (
    name TEXT PRIMARY KEY,
    assertion INTEGER NOT NULL CHECK (assertion = 1)
  );
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
const OTHER_ACTOR = "d64669d3-f2ea-4d26-b219-5d23dc580fcc";
const OPERATION_ID = "188e5572-a712-4b1d-9f67-a260214ef953";

describe("hashAgentInput", () => {
  it("normalizes object key order while preserving meaningful JSON differences", async () => {
    const baseline = await hashAgentInput("edit_asset", { assetId: "a", patch: { name: "Van" } });

    await expect(
      hashAgentInput("edit_asset", { patch: { name: "Van" }, assetId: "a" }),
    ).resolves.toBe(baseline);
    await expect(
      hashAgentInput("edit_asset", { assetId: "a", patch: { name: null } }),
    ).resolves.not.toBe(baseline);
    await expect(hashAgentInput("edit_asset", { assetId: "a" })).resolves.not.toBe(
      await hashAgentInput("edit_asset", { assetId: "a", patch: null }),
    );
    await expect(hashAgentInput("edit_asset", { values: [1, 2] })).resolves.not.toBe(
      await hashAgentInput("edit_asset", { values: [2, 1] }),
    );
    await expect(hashAgentInput("create_asset", { assetId: "a" })).resolves.not.toBe(
      await hashAgentInput("edit_asset", { assetId: "a" }),
    );
  });

  it("rejects values that cannot be represented by canonical JSON", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    await expect(hashAgentInput("edit_asset", { value: undefined })).rejects.toThrow(
      "Agent operation input must be JSON-compatible",
    );
    await expect(hashAgentInput("edit_asset", cyclic)).rejects.toThrow(
      "Agent operation input must be JSON-compatible",
    );
  });
});

describe("D1AgentOperationJournal (real SQLite transactions)", () => {
  it("commits the mutation, outbox, receipt, and versioned private snapshots atomically", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite, ACTOR);
    seedAsset(sqlite, "asset-1", ACTOR, "Before", "123 Sensitive Street");
    const changes = assetChange("Before", "After", "123 Sensitive Street");
    const journal = new D1AgentOperationJournal(db);

    const receipt = await journal.commit(commitRequest(db, ACTOR, OPERATION_ID, changes));

    expect(receipt).toEqual({
      operationId: OPERATION_ID,
      replayed: false,
      entityType: "asset",
      entityId: "asset-1",
      assetId: "asset-1",
      appliedRevision: 1,
    });
    expect(JSON.stringify(receipt)).not.toContain("123 Sensitive Street");
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
    expect(count(sqlite, "activity_event_outbox")).toBe(1);
    const stored = sqlite
      .prepare("SELECT snapshot_version, snapshots_json FROM agent_operation_journal")
      .get();
    expect(stored?.snapshot_version).toBe(1);
    expect(stored?.snapshots_json).toContain("123 Sensitive Street");
  });

  it("rolls back domain, outbox, receipt, and snapshots when a statement fails", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite, ACTOR);
    seedAsset(sqlite, "asset-1", ACTOR, "Before", "123 Sensitive Street");
    const request = commitRequest(
      db,
      ACTOR,
      OPERATION_ID,
      assetChange("Before", "After", "123 Sensitive Street"),
    );
    request.statements.push(
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
      db.prepare("INSERT INTO activity_event_outbox (id) VALUES (?)").bind("event-1"),
    );

    await expect(new D1AgentOperationJournal(db).commit(request)).rejects.toThrow();

    expect(readAsset(sqlite, "asset-1")?.name).toBe("Before");
    expect(count(sqlite, "activity_event_outbox")).toBe(0);
    expect(count(sqlite, "agent_operation_journal")).toBe(0);
  });

  it("serializes concurrent identical commits into one mutation and equivalent receipts", async () => {
    const { sqlite, db, mutationExecutions } = createDatabase();
    seedActor(sqlite, ACTOR);
    seedAsset(sqlite, "asset-1", ACTOR, "Before", "123 Sensitive Street");
    const request = commitRequest(
      db,
      ACTOR,
      OPERATION_ID,
      assetChange("Before", "After", "123 Sensitive Street"),
    );
    const journal = new D1AgentOperationJournal(db);

    const [first, second] = await Promise.all([journal.commit(request), journal.commit(request)]);

    expect(first).toEqual({
      operationId: OPERATION_ID,
      replayed: false,
      entityType: "asset",
      entityId: "asset-1",
      assetId: "asset-1",
      appliedRevision: 1,
    });
    expect(second).toEqual({ ...first, replayed: true });
    expect(readAsset(sqlite, "asset-1")?.revision).toBe(1);
    expect(mutationExecutions()).toBe(1);
    expect(count(sqlite, "activity_event_outbox")).toBe(1);
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
  });

  it("conflicts on a changed tool or input under the same actor and UUID", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite, ACTOR);
    seedAsset(sqlite, "asset-1", ACTOR, "Before", "123 Sensitive Street");
    const journal = new D1AgentOperationJournal(db);
    const request = commitRequest(
      db,
      ACTOR,
      OPERATION_ID,
      assetChange("Before", "After", "123 Sensitive Street"),
    );

    await journal.commit(request);
    const changedInput = commitRequest(
      db,
      ACTOR,
      OPERATION_ID,
      assetChange("Before", "Different", "123 Sensitive Street"),
    );
    changedInput.statements = [
      db.prepare("UPDATE assets SET name = ? WHERE id = ?").bind("Different", "asset-1"),
    ];

    await expect(journal.commit(changedInput)).rejects.toBeInstanceOf(ConflictError);

    expect(readAsset(sqlite, "asset-1")?.name).toBe("After");
    expect(count(sqlite, "agent_operation_journal")).toBe(1);
  });

  it("scopes operation UUIDs by actor and exposes no snapshots from the receipt", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite, ACTOR);
    seedActor(sqlite, OTHER_ACTOR);
    seedAsset(sqlite, "asset-1", ACTOR, "Before", "123 Sensitive Street");
    seedAsset(sqlite, "asset-2", OTHER_ACTOR, "Other", "987 Private Avenue");
    const journal = new D1AgentOperationJournal(db);
    const first = commitRequest(
      db,
      ACTOR,
      OPERATION_ID,
      assetChange("Before", "After", "123 Sensitive Street"),
    );
    const second = commitRequest(
      db,
      OTHER_ACTOR,
      OPERATION_ID,
      assetChange("Other", "Updated", "987 Private Avenue", "asset-2"),
    );

    const firstReceipt = await journal.commit(first);
    await expect(journal.commit(second)).resolves.toMatchObject({
      replayed: false,
      entityId: "asset-2",
    });

    expect(Object.keys(firstReceipt).sort()).toEqual([
      "appliedRevision",
      "assetId",
      "entityId",
      "entityType",
      "operationId",
      "replayed",
    ]);
    expect(await journal.find(ACTOR, OPERATION_ID)).toMatchObject({
      actorId: ACTOR,
      operationId: OPERATION_ID,
      changes: [
        {
          table: "assets",
          before: { metadata: JSON.stringify({ street: "123 Sensitive Street" }) },
        },
      ],
    });
    expect(await journal.find(OTHER_ACTOR, OPERATION_ID)).toMatchObject({ actorId: OTHER_ACTOR });
    expect(count(sqlite, "agent_operation_journal")).toBe(2);
  });
});

function createDatabase(): {
  sqlite: DatabaseSync;
  db: SqliteD1Database;
  mutationExecutions: () => number;
} {
  const sqlite = new DatabaseSync(":memory:");
  let mutationExecutionCount = 0;
  sqlite.function("track_agent_mutation", () => {
    mutationExecutionCount += 1;
    return 1;
  });
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(JOURNAL_SCHEMA);
  return {
    sqlite,
    db: new SqliteD1Database(sqlite),
    mutationExecutions: () => mutationExecutionCount,
  };
}

function seedActor(sqlite: DatabaseSync, id: string): void {
  sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(id);
}

function seedAsset(
  sqlite: DatabaseSync,
  id: string,
  ownerId: string,
  name: string,
  street: string,
): void {
  sqlite
    .prepare("INSERT INTO assets (id, owner_id, name, metadata, revision) VALUES (?, ?, ?, ?, 0)")
    .run(id, ownerId, name, JSON.stringify({ street }));
}

function assetChange(
  beforeName: string,
  afterName: string,
  street: string,
  id = "asset-1",
): AgentRowChange {
  const metadata = JSON.stringify({ street });
  return {
    table: "assets",
    id,
    before: { id, name: beforeName, metadata, revision: 0 },
    after: { id, name: afterName, metadata, revision: 1 },
  };
}

function commitRequest(
  db: D1Database,
  actorId: string,
  operationId: string,
  change: AgentRowChange,
): AgentJournalCommit {
  return {
    actorId: UserId.from(actorId),
    operationId,
    tool: "edit_asset",
    input: { assetId: change.id, name: change.after?.name },
    receipt: {
      operationId,
      entityType: "asset",
      entityId: change.id,
      assetId: change.id,
      appliedRevision: 1,
    },
    changes: [change],
    statements: [
      db
        .prepare(
          "UPDATE assets SET name = ?, revision = revision + track_agent_mutation() WHERE id = ?",
        )
        .bind(change.after?.name, change.id),
      db
        .prepare("INSERT INTO activity_event_outbox (id) VALUES (?)")
        .bind(`event-${actorId}-${operationId}`),
    ],
  };
}

function count(sqlite: DatabaseSync, table: string): number {
  const allowed = new Set(["agent_operation_journal", "activity_event_outbox"]);
  if (!allowed.has(table)) throw new Error("Unexpected test table");
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (row === undefined || typeof row.count !== "number") throw new Error("Expected a row count");
  return row.count;
}

function readAsset(
  sqlite: DatabaseSync,
  id: string,
): { id: string; name: string; revision: number } | undefined {
  const row = sqlite.prepare("SELECT id, name, revision FROM assets WHERE id = ?").get(id);
  if (row === undefined) return undefined;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.revision !== "number"
  ) {
    throw new Error("Unexpected asset row in SQLite test");
  }
  return { id: row.id, name: row.name, revision: row.revision };
}

class SqliteD1Database {
  #batchTail: Promise<void> = Promise.resolve();

  constructor(private readonly sqlite: DatabaseSync) {
    // Node's ambient Workers declarations are type-only; this adapter uses
    // the same public method contract without requiring a Workers runtime.
  }

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
    return Promise.reject(new Error("exec is not used in this test adapter"));
  }

  withSession(): D1DatabaseSession {
    throw new Error("withSession is not used in this test adapter");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(new Error("dump is not used in this test adapter"));
  }
}

class SqliteD1PreparedStatement {
  #values: unknown[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
  ) {
    // Prepared statements are represented by plain objects in the Workers API.
  }

  bind(...values: unknown[]): D1PreparedStatement {
    this.#values = values;
    return this;
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.#prepared().get(...toSqlValues(this.#values));
    if (row === undefined) return Promise.resolve(null);
    if (columnName !== undefined) {
      const value = row[columnName];
      return Promise.resolve(value === undefined || value === null ? null : asD1Row<T>(value));
    }
    return Promise.resolve(asD1Row<T>(row));
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.#prepared()
      .all(...toSqlValues(this.#values))
      .map((row) => asD1Row<T>(row));
    return Promise.resolve({ success: true, meta: emptyMeta(), results });
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(
    options?: { columnNames?: false } | { columnNames: true },
  ): Promise<T[] | [string[], ...T[]]> {
    const statement = this.#prepared();
    if (options?.columnNames === true) {
      const columns = statement.columns().map((column) => column.name);
      const rows = statement.all(...toSqlValues(this.#values));
      return Promise.resolve(
        asD1Row<[string[], ...T[]]>([columns, ...rows.map((row) => Object.values(row))]),
      );
    }
    return Promise.resolve(
      asD1Row<T[]>(statement.all(...toSqlValues(this.#values)).map((row) => Object.values(row))),
    );
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

/** Implements D1's generic row contract at the Node SQLite test boundary. */
function asD1Row<T>(value: unknown): T {
  return value as T;
}
