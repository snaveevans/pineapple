import { DatabaseSync } from "node:sqlite";
import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { D1AgentOperationRecovery } from "./D1AgentOperationRecovery.ts";
import { D1AgentOperationJournal } from "./D1AgentOperationJournal.ts";
import type { AgentRowSnapshot } from "./AgentJournalTypes.ts";

const ACTOR = "239f68c0-c6a2-4550-8c5b-30e0f66fe7e2";
const OPERATION = "188e5572-a712-4b1d-9f67-a260214ef953";
const ASSET = "89cf5a7c-62b7-4a73-a9eb-61a669e30d35";
const CREATED_AT_CANARY = "123 Sensitive Street";
const RESTORED_AT_CANARY = "456 Private Avenue";

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
  CREATE TABLE maintenance_tasks (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
    owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    interval_value INTEGER NOT NULL, interval_unit TEXT NOT NULL,
    last_completed_date TEXT, next_due TEXT NOT NULL, created_at TEXT NOT NULL,
    schedule_seed_date TEXT, initial_last_completed_date TEXT,
    revision INTEGER NOT NULL, next_due_override TEXT
  );
  CREATE TABLE maintenance_records (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
    owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    performed_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
    task_id TEXT REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
    revision INTEGER NOT NULL
  );
  CREATE TABLE notification_event_outbox (
    id TEXT PRIMARY KEY, consumer TEXT NOT NULL, event_type TEXT NOT NULL,
    payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT, delivered_at TEXT
  );
  CREATE TABLE notification_ingested_events (
    event_id TEXT PRIMARY KEY, maintenance_task_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL, processed_at TEXT NOT NULL
  );
  CREATE TABLE scheduled_reminders (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    maintenance_task_id TEXT NOT NULL, asset_id TEXT NOT NULL,
    asset_name TEXT NOT NULL, asset_type TEXT NOT NULL, task_title TEXT NOT NULL,
    next_due TEXT NOT NULL, fire_at TEXT NOT NULL, snoozed_until TEXT,
    status TEXT NOT NULL, last_event_id TEXT NOT NULL,
    last_event_occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE mutation_guards (
    name TEXT PRIMARY KEY, assertion INTEGER NOT NULL CHECK (assertion = 1)
  );
  CREATE TABLE agent_operation_journal (
    actor_id TEXT NOT NULL REFERENCES users(id), operation_id TEXT NOT NULL,
    tool TEXT NOT NULL, input_hash TEXT NOT NULL, receipt_json TEXT NOT NULL,
    snapshot_version INTEGER NOT NULL, snapshots_json TEXT NOT NULL,
    created_at TEXT NOT NULL, restored_at TEXT,
    PRIMARY KEY (actor_id, operation_id)
  );
`;

describe("recovery metadata privacy", () => {
  it.each([
    { column: "created_at", canary: CREATED_AT_CANARY, action: "inspect" },
    { column: "created_at", canary: CREATED_AT_CANARY, action: "dry-run" },
    { column: "created_at", canary: CREATED_AT_CANARY, action: "apply" },
    { column: "restored_at", canary: RESTORED_AT_CANARY, action: "inspect" },
    { column: "restored_at", canary: RESTORED_AT_CANARY, action: "dry-run" },
    { column: "restored_at", canary: RESTORED_AT_CANARY, action: "apply" },
  ] as const)(
    "does not expose malformed $column metadata through $action",
    async ({ column, canary, action }) => {
      const { sqlite, db } = createDatabase();
      const snapshot = assetSnapshot();
      sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(ACTOR);
      sqlite
        .prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(...assetValues(snapshot));
      await new D1AgentOperationJournal(db).commit({
        actorId: UserId.from(ACTOR),
        operationId: OPERATION,
        tool: "edit_asset",
        input: { operationId: OPERATION },
        receipt: {
          operationId: OPERATION,
          entityType: "asset",
          entityId: ASSET,
          assetId: ASSET,
          appliedRevision: 0,
        },
        changes: [{ table: "assets", id: ASSET, before: snapshot, after: snapshot }],
        statements: [],
      });
      sqlite
        .prepare(
          `UPDATE agent_operation_journal SET ${column} = ? WHERE actor_id = ? AND operation_id = ?`,
        )
        .run(canary, ACTOR, OPERATION);
      const journalBefore = sqlite.prepare("SELECT * FROM agent_operation_journal").all();
      const assetBefore = readAsset(sqlite);

      const result = await runAction(new D1AgentOperationRecovery(db), action).catch(
        (error: unknown) => error,
      );
      const visibleResult =
        result instanceof Error ? `${result.name}: ${result.message}` : JSON.stringify(result);

      expect(visibleResult).not.toContain(canary);
      expect(readAsset(sqlite)).toEqual(assetBefore);
      expect(sqlite.prepare("SELECT * FROM agent_operation_journal").all()).toEqual(journalBefore);
      expect(count(sqlite, "notification_event_outbox")).toBe(0);
      expect(count(sqlite, "maintenance_records")).toBe(0);
      sqlite.close();
    },
  );
});

async function runAction(
  recovery: D1AgentOperationRecovery,
  action: "inspect" | "dry-run" | "apply",
): Promise<unknown> {
  if (action === "inspect") return recovery.inspect(ACTOR, OPERATION);
  if (action === "apply") return recovery.recover(ACTOR, OPERATION, { apply: true });
  return recovery.recover(ACTOR, OPERATION);
}

function createDatabase(): { sqlite: DatabaseSync; db: SqliteD1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(SCHEMA);
  return { sqlite, db: new SqliteD1Database(sqlite) };
}

function assetSnapshot(): AgentRowSnapshot {
  return {
    id: ASSET,
    owner_id: ACTOR,
    name: "Truck",
    type: "vehicle",
    metadata: "{}",
    archived_at: null,
    created_at: "2026-09-25T10:00:00.000Z",
    updated_at: "2026-09-25T10:00:00.000Z",
    shared_team_id: null,
    revision: 0,
  };
}

function assetValues(asset: AgentRowSnapshot): (string | number | null)[] {
  return [
    requiredValue(asset, "id"),
    requiredValue(asset, "owner_id"),
    requiredValue(asset, "name"),
    requiredValue(asset, "type"),
    requiredValue(asset, "metadata"),
    requiredValue(asset, "archived_at"),
    requiredValue(asset, "created_at"),
    requiredValue(asset, "updated_at"),
    requiredValue(asset, "shared_team_id"),
    requiredValue(asset, "revision"),
  ];
}

function requiredValue(snapshot: AgentRowSnapshot, field: string): string | number | null {
  const value = snapshot[field];
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error("Expected a SQLite asset snapshot value");
}

function readAsset(sqlite: DatabaseSync): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(ASSET);
}

function count(
  sqlite: DatabaseSync,
  table: "maintenance_records" | "notification_event_outbox",
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
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.#values = values;
    return this;
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.#prepared().get(...sqlValues(this.#values));
    if (row === undefined) return Promise.resolve(null);
    if (columnName !== undefined) {
      const value = row[columnName];
      return Promise.resolve(value === undefined || value === null ? null : (value as T));
    }
    return Promise.resolve(row as T);
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.#prepared().all(...sqlValues(this.#values)) as T[];
    return Promise.resolve({ success: true, meta: emptyMeta(), results });
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    if (options?.columnNames === true) {
      throw new Error("columnNames is not used in this test adapter");
    }
    return Promise.resolve(
      this.#prepared()
        .all(...sqlValues(this.#values))
        .map((row) => Object.values(row) as T),
    );
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    if (/^\s*(select|with|pragma)\b/i.test(this.query)) return this.all<T>();
    const result = this.#prepared().run(...sqlValues(this.#values));
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

function sqlValues(values: unknown[]): (string | number | bigint | Uint8Array | null)[] {
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
