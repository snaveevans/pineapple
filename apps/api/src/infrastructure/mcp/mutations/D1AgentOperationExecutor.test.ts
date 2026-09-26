import { DatabaseSync } from "node:sqlite";
import {
  AssetId,
  ForbiddenError,
  ConflictError,
  InvariantError,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../../domain/events/DomainEvent.ts";
import type { EventBus } from "../../../application/ports/EventBus.ts";
import type { AgentMutationCommand } from "../../../application/ports/AgentOperationExecutor.ts";
import { D1TeamRepository } from "../../persistence/D1TeamRepository.ts";
import { D1MaintenanceWriteGate } from "../../persistence/D1MaintenanceWriteGate.ts";
import { D1AgentOperationExecutor } from "./D1AgentOperationExecutor.ts";

const ACTOR = UserId.from("40000000-0000-4000-8000-000000000001");
const TEAM_OWNER = UserId.from("40000000-0000-4000-8000-000000000002");
const TODAY = "2026-06-11";

class BufferedEventBus implements EventBus {
  readonly events: DomainEvent[] = [];
  fail = false;
  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  publishAll(events: readonly DomainEvent[]): Promise<void> {
    if (this.fail) return Promise.reject(new Error("telemetry unavailable"));
    this.events.push(...events);
    return Promise.resolve();
  }
  subscribe(): void {}
}

type SqlStatement = D1PreparedStatement & {
  query: string;
  values: unknown[];
};

type SqlHarness = {
  sqlite: DatabaseSync;
  db: D1Database;
  setAfterBatchCommit(this: void, callback: (() => void) | null): void;
  setAfterMatchingRead(this: void, queryFragment: string, callback: (() => void) | null): void;
  setBeforeNextBatch(this: void, callback: (() => void) | null): void;
  getSelectQueryCount(this: void): number;
};

function createSqlHarness(): SqlHarness {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE team_members (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL, joined_at TEXT NOT NULL, UNIQUE(team_id, user_id)
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      type TEXT NOT NULL, metadata TEXT NOT NULL, archived_at TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, shared_team_id TEXT REFERENCES teams(id), revision INTEGER
    );
    CREATE TABLE maintenance_tasks (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), owner_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, interval_value INTEGER NOT NULL, interval_unit TEXT NOT NULL,
      last_completed_date TEXT, next_due TEXT NOT NULL, created_at TEXT NOT NULL,
      schedule_seed_date TEXT NOT NULL, initial_last_completed_date TEXT, revision INTEGER NOT NULL DEFAULT 0,
      next_due_override TEXT
    );
    CREATE TABLE maintenance_records (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), owner_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, performed_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
      task_id TEXT REFERENCES maintenance_tasks(id) ON DELETE SET NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE maintenance_write_gate (
      id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL CHECK (mode IN ('open', 'frozen'))
    );
    INSERT INTO maintenance_write_gate (id, mode) VALUES (1, 'open');
    CREATE TABLE mutation_guards (
      name TEXT PRIMARY KEY, assertion INTEGER NOT NULL CHECK (assertion = 1)
    );
    CREATE TABLE activity_event_outbox (
      id TEXT PRIMARY KEY, consumer TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE notification_event_outbox (
      id TEXT PRIMARY KEY, consumer TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE agent_operation_journal (
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL, tool TEXT NOT NULL, input_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)), snapshot_version INTEGER NOT NULL,
      snapshots_json TEXT NOT NULL CHECK (json_valid(snapshots_json)), created_at TEXT NOT NULL, restored_at TEXT,
      PRIMARY KEY (actor_id, operation_id)
    );
  `);

  let afterBatchCommit: (() => void) | null = null;
  let afterMatchingRead: { queryFragment: string; callback: () => void } | null = null;
  let beforeNextBatch: (() => void) | null = null;
  let batchTail: Promise<void> = Promise.resolve();
  let selectQueryCount = 0;
  const didRead = (query: string) => {
    if (afterMatchingRead !== null && query.includes(afterMatchingRead.queryFragment)) {
      const callback = afterMatchingRead.callback;
      afterMatchingRead = null;
      callback();
    }
  };
  const makeStatement = (query: string, values: unknown[] = []): SqlStatement => {
    const stmt = {
      query,
      values,
      bind: (...nextValues: unknown[]) => {
        if (nextValues.length > 100) {
          throw new Error("SQLite harness D1 limit: at most 100 bound parameters per statement");
        }
        return makeStatement(query, nextValues);
      },
      run: () => {
        const result = sqlite.prepare(query).run(...(values as never[]));
        return Promise.resolve({ success: true, meta: { changes: Number(result.changes) } });
      },
      first: <T>() => {
        if (/^\s*SELECT\b/i.test(query)) selectQueryCount += 1;
        const row = sqlite.prepare(query).get(...(values as never[]));
        didRead(query);
        return Promise.resolve((row ?? null) as T | null);
      },
      all: <T>() => {
        if (/^\s*SELECT\b/i.test(query)) selectQueryCount += 1;
        const results = sqlite.prepare(query).all(...(values as never[])) as T[];
        didRead(query);
        return Promise.resolve({ results });
      },
    };
    return stmt as unknown as SqlStatement;
  };
  const db = {
    prepare: (query: string) => makeStatement(query),
    batch: (statements: D1PreparedStatement[]) => {
      const execute = () => {
        const before = beforeNextBatch;
        beforeNextBatch = null;
        before?.();
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const results = statements.map((statement) => {
            const bound = statement as SqlStatement;
            const result = sqlite.prepare(bound.query).run(...(bound.values as never[]));
            return { success: true, meta: { changes: Number(result.changes) } };
          });
          sqlite.exec("COMMIT");
          afterBatchCommit?.();
          return Promise.resolve(results);
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      };
      const result = batchTail.then(execute);
      batchTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  } as unknown as D1Database;
  return {
    sqlite,
    db,
    setAfterBatchCommit: (callback) => {
      afterBatchCommit = callback;
    },
    setAfterMatchingRead: (queryFragment, callback) => {
      afterMatchingRead = callback === null ? null : { queryFragment, callback };
    },
    setBeforeNextBatch: (callback) => {
      beforeNextBatch = callback;
    },
    getSelectQueryCount: () => selectQueryCount,
  };
}

function createExecutor(db: D1Database, eventBus = new BufferedEventBus()) {
  return {
    eventBus,
    executor: new D1AgentOperationExecutor({
      db,
      teams: new D1TeamRepository(db),
      eventBus,
      dates: { today: () => TODAY },
      writeGate: new D1MaintenanceWriteGate(db),
    }),
  };
}

function seedUser(sqlite: DatabaseSync, userId: UserId, name = "Field User"): void {
  sqlite
    .prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, `${userId}@example.com`, name, "2026-01-01T00:00:00.000Z");
}

function seedAsset(
  sqlite: DatabaseSync,
  options: {
    id?: AssetId;
    ownerId?: UserId;
    metadata?: unknown;
    sharedTeamId?: string | null;
    revision?: number | null;
  } = {},
): AssetId {
  const id = options.id ?? AssetId.generate();
  const ownerId = options.ownerId ?? ACTOR;
  const metadata = options.metadata ?? {
    kind: "vehicle",
    make: "Ram",
    model: "2500",
    year: 2016,
  };
  sqlite
    .prepare(
      `INSERT INTO assets (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      id,
      ownerId,
      "Truck",
      (metadata as { kind: string }).kind,
      JSON.stringify(metadata),
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      options.sharedTeamId ?? null,
      options.revision === undefined ? 0 : options.revision,
    );
  return id;
}

function seedTask(
  sqlite: DatabaseSync,
  options: {
    id?: MaintenanceTaskId;
    assetId: AssetId;
    ownerId?: UserId;
    lastCompletedDate?: string | null;
    nextDue?: string;
    revision?: number;
  },
): MaintenanceTaskId {
  const id = options.id ?? MaintenanceTaskId.generate();
  const lastCompletedDate = options.lastCompletedDate ?? null;
  sqlite
    .prepare(
      `INSERT INTO maintenance_tasks
       (id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date,
        next_due, created_at, schedule_seed_date, initial_last_completed_date, revision, next_due_override)
       VALUES (?, ?, ?, ?, 2, 'month', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      options.assetId,
      options.ownerId ?? ACTOR,
      "Replace furnace filter",
      lastCompletedDate,
      options.nextDue ?? "2026-08-01",
      "2026-01-01T00:00:00.000Z",
      lastCompletedDate ?? "2026-01-01",
      lastCompletedDate,
      options.revision ?? 0,
    );
  return id;
}

function seedRecord(
  sqlite: DatabaseSync,
  options: {
    assetId: AssetId;
    taskId?: MaintenanceTaskId | null;
    revision?: number;
    performedAt?: string;
  },
): MaintenanceRecordId {
  const id = MaintenanceRecordId.generate();
  sqlite
    .prepare(
      `INSERT INTO maintenance_records
       (id, asset_id, owner_id, title, performed_at, notes, created_at, task_id, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      options.assetId,
      ACTOR,
      "Oil change",
      options.performedAt ?? "2026-06-01",
      "Old note",
      "2026-06-01T00:00:00.000Z",
      options.taskId ?? null,
      options.revision ?? 0,
    );
  return id;
}

function execute(
  executor: D1AgentOperationExecutor,
  command: AgentMutationCommand,
  requesterId: UserId = ACTOR,
) {
  return executor.execute(requesterId, command);
}

function journalSnapshots(sqlite: DatabaseSync, operationId: string): string {
  const row = sqlite
    .prepare("SELECT snapshots_json FROM agent_operation_journal WHERE operation_id = ?")
    .get(operationId) as { snapshots_json: string } | undefined;
  return row?.snapshots_json ?? "";
}

describe("D1AgentOperationExecutor (real SQLite transactions)", () => {
  it("creates and partially edits assets through application use cases with private complete snapshots", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const { executor } = createExecutor(db);
    const createId = crypto.randomUUID();
    const created = await execute(executor, {
      kind: "create_asset",
      operationId: createId,
      name: "Van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({
      operationId: createId,
      entityType: "asset",
      appliedRevision: 0,
      replayed: false,
    });

    const propertyId = seedAsset(sqlite, {
      metadata: {
        kind: "property",
        nickname: "Cabin",
        address: {
          street: "44 Hidden Road",
          city: "Old Town",
          state: "UT",
          postalCode: "84000",
          country: "US",
        },
      },
      revision: null,
    });
    const operationId = crypto.randomUUID();
    const edited = await execute(executor, {
      kind: "edit_asset",
      operationId,
      assetId: propertyId,
      expectedRevision: 0,
      metadata: { kind: "property", nickname: null, address: { city: "New Town" } },
    });

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.appliedRevision).toBe(1);
    expect(JSON.stringify(edited.value)).not.toContain("44 Hidden Road");
    const row = sqlite
      .prepare("SELECT metadata, revision FROM assets WHERE id = ?")
      .get(propertyId) as {
      metadata: string;
      revision: number;
    };
    expect(JSON.parse(row.metadata)).toEqual({
      kind: "property",
      address: {
        street: "44 Hidden Road",
        city: "New Town",
        state: "UT",
        postalCode: "84000",
        country: "US",
      },
    });
    expect(row.revision).toBe(1);
    const snapshots = journalSnapshots(sqlite, operationId);
    expect(snapshots).toContain("44 Hidden Road");
    expect(snapshots).toContain("Old Town");
    expect(snapshots).toContain("New Town");
  });

  it("does not replay a created-asset receipt after its current parent asset is gone", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const { executor } = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_asset",
      operationId: crypto.randomUUID(),
      name: "Van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    };
    const first = await execute(executor, command);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    sqlite.prepare("DELETE FROM assets WHERE id = ?").run(first.value.assetId);

    const replay = await execute(executor, command);

    expect(replay.ok).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
  });

  it("creates, edits, and reschedules tasks with monotonically increasing revisions", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const { executor } = createExecutor(db);
    const created = await execute(executor, {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-04-01",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const taskId = MaintenanceTaskId.from(created.value.entityId);
    expect(created.value.appliedRevision).toBe(0);

    const edited = await execute(executor, {
      kind: "edit_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      expectedRevision: 0,
      intervalValue: 3,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.appliedRevision).toBe(1);

    const rescheduled = await execute(executor, {
      kind: "reschedule_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      expectedRevision: 1,
      nextDue: "2026-09-15",
    });
    expect(rescheduled.ok).toBe(true);
    if (!rescheduled.ok) return;
    expect(rescheduled.value.appliedRevision).toBe(2);
    const row = sqlite
      .prepare("SELECT revision, next_due FROM maintenance_tasks WHERE id = ?")
      .get(taskId) as {
      revision: number;
      next_due: string;
    };
    expect(row).toEqual({ revision: 2, next_due: "2026-09-15" });
  });

  it("creates and corrects a linked maintenance record with complete linked-task snapshots", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, {
      assetId,
      lastCompletedDate: "2026-04-01",
      nextDue: "2026-06-01",
    });
    const { executor } = createExecutor(db);
    const operationId = crypto.randomUUID();
    const created = await execute(executor, {
      kind: "record_maintenance",
      operationId,
      assetId,
      taskId,
      expectedTaskRevision: 0,
      title: "Replaced the filter",
      performedAt: "2026-06-09",
      notes: "A routine replacement",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.linkedTask).toMatchObject({ appliedRevision: 1 });
    const recordId = MaintenanceRecordId.from(created.value.entityId);
    const createSnapshot = journalSnapshots(sqlite, operationId);
    expect(createSnapshot).toContain('"table":"maintenance_records"');
    expect(createSnapshot).toContain('"table":"maintenance_tasks"');
    expect(createSnapshot).toContain('"schedule_seed_date"');
    expect(createSnapshot).toContain('"next_due_override"');

    const correctionId = crypto.randomUUID();
    const corrected = await execute(executor, {
      kind: "edit_maintenance_record",
      operationId: correctionId,
      assetId,
      recordId,
      expectedRevision: 0,
      performedAt: "2026-06-10",
      notes: null,
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.value).toMatchObject({
      appliedRevision: 1,
      linkedTask: { appliedRevision: 2 },
    });
    const task = sqlite
      .prepare("SELECT revision, last_completed_date, next_due FROM maintenance_tasks WHERE id = ?")
      .get(taskId) as {
      revision: number;
      last_completed_date: string;
      next_due: string;
    };
    expect(task).toMatchObject({ revision: 2, last_completed_date: "2026-06-10" });
    const correctionSnapshot = journalSnapshots(sqlite, correctionId);
    expect(correctionSnapshot).toContain('"table":"maintenance_records"');
    expect(correctionSnapshot).toContain('"table":"maintenance_tasks"');
  });

  it("keeps no-op task edits replayable with an identical full recovery snapshot", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, { assetId, revision: 4 });
    const { executor, eventBus } = createExecutor(db);
    const operationId = crypto.randomUUID();
    const command: AgentMutationCommand = {
      kind: "edit_maintenance_task",
      operationId,
      assetId,
      taskId,
      expectedRevision: 4,
      title: "Replace furnace filter",
    };

    const first = await execute(executor, command);
    const replay = await execute(executor, command);

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(first.value.appliedRevision).toBe(4);
    expect(replay.value).toEqual({ ...first.value, replayed: true });
    expect(eventBus.events).toHaveLength(0);
    expect(
      sqlite.prepare("SELECT revision FROM maintenance_tasks WHERE id = ?").get(taskId),
    ).toEqual({
      revision: 4,
    });
    const snapshots = JSON.parse(journalSnapshots(sqlite, operationId)) as {
      changes: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
    };
    expect(snapshots.changes).toHaveLength(1);
    expect(snapshots.changes[0]?.before).toEqual(snapshots.changes[0]?.after);
  });

  it.each([7, null] as const)(
    "records identical full asset snapshots for a no-op edit with stored revision %s",
    async (storedRevision) => {
      const { sqlite, db } = createSqlHarness();
      seedUser(sqlite, ACTOR);
      const assetId = seedAsset(sqlite, { revision: storedRevision });
      const original = sqlite
        .prepare("SELECT name, metadata, updated_at, revision FROM assets WHERE id = ?")
        .get(assetId);
      const { executor, eventBus } = createExecutor(db);
      const operationId = crypto.randomUUID();

      const result = await execute(executor, {
        kind: "edit_asset",
        operationId,
        assetId,
        expectedRevision: storedRevision ?? 0,
        metadata: { kind: "vehicle", make: "Ram" },
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.appliedRevision).toBe(storedRevision ?? 0);
      expect(
        sqlite
          .prepare("SELECT name, metadata, updated_at, revision FROM assets WHERE id = ?")
          .get(assetId),
      ).toEqual(original);
      const snapshot = JSON.parse(journalSnapshots(sqlite, operationId)) as {
        changes: Array<{
          table: string;
          id: string;
          before: Record<string, unknown>;
          after: Record<string, unknown>;
        }>;
      };
      expect(snapshot.changes).toHaveLength(1);
      expect(snapshot.changes[0]).toMatchObject({ table: "assets", id: String(assetId) });
      expect(snapshot.changes[0]?.before).toEqual(snapshot.changes[0]?.after);
      expect(snapshot.changes[0]?.before?.revision).toBe(storedRevision);
      expect(snapshot.changes[0]?.before?.metadata).toBe(
        (original as { metadata: string }).metadata,
      );
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
        count: 0,
      });
      expect(eventBus.events).toHaveLength(0);
    },
  );

  it("rejects a source row that disappears between the use-case read and snapshot read", async () => {
    const { sqlite, db, setAfterMatchingRead, setBeforeNextBatch } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    setAfterMatchingRead("COALESCE(revision, 0) AS revision FROM assets WHERE id = ?", () =>
      sqlite.prepare("DELETE FROM assets WHERE id = ?").run(assetId),
    );
    setBeforeNextBatch(() => {
      sqlite
        .prepare(
          `INSERT INTO assets
             (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 0)`,
        )
        .run(
          assetId,
          ACTOR,
          "Concurrent Truck",
          "vehicle",
          JSON.stringify({ kind: "vehicle", make: "Ram", model: "2500", year: 2016 }),
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
        );
    });
    const { executor, eventBus } = createExecutor(db);

    const result = await execute(executor, {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 3,
      intervalUnit: "month",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_tasks").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("rolls back a staged write when the access/revision guard loses a concurrent race", async () => {
    const { sqlite, db, setBeforeNextBatch } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const { executor, eventBus } = createExecutor(db);
    setBeforeNextBatch(() => {
      sqlite.prepare("UPDATE assets SET revision = 7 WHERE id = ?").run(assetId);
    });

    const result = await execute(executor, {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 3,
      intervalUnit: "month",
    });

    expect(result.ok).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_tasks").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("rolls back when team visibility is revoked after the application access check", async () => {
    const { sqlite, db, setBeforeNextBatch } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    seedUser(sqlite, TEAM_OWNER, "Owner");
    const teamId = crypto.randomUUID();
    sqlite
      .prepare("INSERT INTO teams (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(teamId, TEAM_OWNER, "Field Team", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), teamId, ACTOR, "member", "2026-01-02T00:00:00.000Z");
    const assetId = seedAsset(sqlite, { ownerId: TEAM_OWNER, sharedTeamId: teamId });
    const { executor, eventBus } = createExecutor(db);
    setBeforeNextBatch(() => {
      sqlite
        .prepare(
          "UPDATE assets SET shared_team_id = NULL, revision = COALESCE(revision, 0) + 1 WHERE id = ?",
        )
        .run(assetId);
    });

    const result = await execute(executor, {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 3,
      intervalUnit: "month",
    });

    expect(result.ok).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_tasks").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("rolls back record reconciliation when a linked record set changes before commit", async () => {
    const { sqlite, db, setBeforeNextBatch } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, {
      assetId,
      lastCompletedDate: "2026-05-01",
      nextDue: "2026-07-01",
      revision: 2,
    });
    const recordId = seedRecord(sqlite, { assetId, taskId, performedAt: "2026-06-01" });
    const { executor, eventBus } = createExecutor(db);
    setBeforeNextBatch(() => {
      seedRecord(sqlite, { assetId, taskId, performedAt: "2026-06-03" });
    });

    const result = await execute(executor, {
      kind: "edit_maintenance_record",
      operationId: crypto.randomUUID(),
      assetId,
      recordId,
      expectedRevision: 0,
      performedAt: "2026-06-02",
    });

    expect(result.ok).toBe(false);
    expect(
      sqlite
        .prepare("SELECT performed_at, revision FROM maintenance_records WHERE id = ?")
        .get(recordId),
    ).toEqual({
      performed_at: "2026-06-01",
      revision: 0,
    });
    expect(
      sqlite
        .prepare("SELECT revision, last_completed_date FROM maintenance_tasks WHERE id = ?")
        .get(taskId),
    ).toEqual({
      revision: 2,
      last_completed_date: "2026-05-01",
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("rejects a linked record row changed between aggregate and raw snapshot reads", async () => {
    const { sqlite, db, setAfterMatchingRead } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, {
      assetId,
      lastCompletedDate: "2026-06-01",
      nextDue: "2026-08-01",
      revision: 2,
    });
    const recordId = seedRecord(sqlite, { assetId, taskId, performedAt: "2026-06-01" });
    const otherRecordId = seedRecord(sqlite, { assetId, taskId, performedAt: "2026-05-01" });
    setAfterMatchingRead("WHERE task_id = ?", () => {
      sqlite
        .prepare("UPDATE maintenance_records SET title = ?, revision = revision + 1 WHERE id = ?")
        .run("Concurrent record edit", otherRecordId);
    });
    const { executor, eventBus } = createExecutor(db);

    const result = await execute(executor, {
      kind: "edit_maintenance_record",
      operationId: crypto.randomUUID(),
      assetId,
      recordId,
      expectedRevision: 0,
      title: "Corrected target record",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
    expect(
      sqlite.prepare("SELECT title, revision FROM maintenance_records WHERE id = ?").get(recordId),
    ).toEqual({
      title: "Oil change",
      revision: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("reconciles more than 100 linked records within D1 binding and query limits", async () => {
    const { sqlite, db, getSelectQueryCount } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, {
      assetId,
      lastCompletedDate: "2026-06-01",
      nextDue: "2026-08-01",
      revision: 2,
    });
    const recordIds: MaintenanceRecordId[] = [];
    for (let index = 0; index < 120; index += 1) {
      recordIds.push(seedRecord(sqlite, { assetId, taskId, performedAt: "2026-06-01" }));
    }
    const recordId = recordIds[0];
    if (recordId === undefined) throw new Error("Expected a seeded maintenance record.");
    const { executor } = createExecutor(db);
    const readsBefore = getSelectQueryCount();

    const result = await execute(executor, {
      kind: "edit_maintenance_record",
      operationId: crypto.randomUUID(),
      assetId,
      recordId,
      expectedRevision: 0,
      title: "Corrected oil change label",
    });

    expect(result.ok).toBe(true);
    expect(getSelectQueryCount() - readsBefore).toBeLessThan(20);
    expect(
      sqlite.prepare("SELECT title, revision FROM maintenance_records WHERE id = ?").get(recordId),
    ).toEqual({ title: "Corrected oil change label", revision: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
  });

  it("fails the transaction if a revision-guarded update silently changes zero rows", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const recordId = seedRecord(sqlite, { assetId });
    sqlite.exec(`
      CREATE TRIGGER ignore_record_update
      BEFORE UPDATE ON maintenance_records
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);
    const { executor, eventBus } = createExecutor(db);

    const result = await execute(executor, {
      kind: "edit_maintenance_record",
      operationId: crypto.randomUUID(),
      assetId,
      recordId,
      expectedRevision: 0,
      title: "Corrected title",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
    expect(
      sqlite.prepare("SELECT title, revision FROM maintenance_records WHERE id = ?").get(recordId),
    ).toEqual({
      title: "Oil change",
      revision: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("does not create a journal entry when an outbox statement aborts the batch", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    sqlite.exec(`
      CREATE TRIGGER fail_asset_outbox
      BEFORE INSERT ON activity_event_outbox
      WHEN NEW.event_type = 'AssetCreated'
      BEGIN
        SELECT RAISE(ABORT, 'outbox unavailable');
      END;
    `);
    const { executor, eventBus } = createExecutor(db);

    const result = await execute(executor, {
      kind: "create_asset",
      operationId: crypto.randomUUID(),
      name: "Van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvariantError);
      expect(result.error.message).not.toContain("outbox unavailable");
    }
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
    expect(eventBus.events).toHaveLength(0);
  });

  it("requires the linked task revision on linked record creation", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, { assetId });
    const { executor } = createExecutor(db);

    const result = await execute(executor, {
      kind: "record_maintenance",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      title: "Changed oil",
      performedAt: TODAY,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ValidationError);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_records").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 0,
    });
  });

  it("rejects a reused operation ID with changed command input", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const { executor } = createExecutor(db);
    const operationId = crypto.randomUUID();
    const first = await execute(executor, {
      kind: "create_asset",
      operationId,
      name: "Van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    });
    expect(first.ok).toBe(true);

    const conflict = await execute(executor, {
      kind: "create_asset",
      operationId,
      name: "Different van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    });

    expect(conflict.ok).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
  });

  it("returns a durable receipt when a post-commit telemetry subscriber fails", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const eventBus = new BufferedEventBus();
    eventBus.fail = true;
    const { executor } = createExecutor(db, eventBus);

    const result = await execute(executor, {
      kind: "create_asset",
      operationId: crypto.randomUUID(),
      name: "Van",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    });

    expect(result.ok).toBe(true);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
  });

  it("replays once under concurrent identical requests and returns the same safe receipt", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    const { executor, eventBus } = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_asset",
      operationId: crypto.randomUUID(),
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2024 },
    };

    const [first, second] = await Promise.all([
      execute(executor, command),
      execute(executor, command),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.replayed).not.toBe(second.value.replayed);
    const committed = first.value.replayed ? second.value : first.value;
    const replayed = first.value.replayed ? first.value : second.value;
    expect(replayed).toEqual({ ...committed, replayed: true });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM assets").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()).toEqual({
      count: 1,
    });
    expect(eventBus.events).toHaveLength(1);
  });

  it("does not return a stored receipt after team access has been revoked", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    seedUser(sqlite, TEAM_OWNER, "Owner");
    const teamId = crypto.randomUUID();
    sqlite
      .prepare("INSERT INTO teams (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(teamId, TEAM_OWNER, "Field Team", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), teamId, ACTOR, "member", "2026-01-02T00:00:00.000Z");
    const assetId = seedAsset(sqlite, { ownerId: TEAM_OWNER, sharedTeamId: teamId });
    const { executor, eventBus } = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 3,
      intervalUnit: "month",
    };
    const first = await execute(executor, command);
    expect(first.ok).toBe(true);
    const eventCount = eventBus.events.length;
    sqlite.prepare("UPDATE assets SET shared_team_id = NULL WHERE id = ?").run(assetId);

    const replay = await execute(executor, command);

    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error).toBeInstanceOf(ForbiddenError);
    expect(eventBus.events).toHaveLength(eventCount);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_tasks").get()).toEqual({
      count: 1,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
  });

  it("reauthorizes a same-key race replay after the winning commit", async () => {
    const { sqlite, db, setAfterBatchCommit } = createSqlHarness();
    seedUser(sqlite, ACTOR);
    seedUser(sqlite, TEAM_OWNER, "Owner");
    const teamId = crypto.randomUUID();
    sqlite
      .prepare("INSERT INTO teams (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(teamId, TEAM_OWNER, "Field Team", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), teamId, ACTOR, "member", "2026-01-02T00:00:00.000Z");
    const assetId = seedAsset(sqlite, { ownerId: TEAM_OWNER, sharedTeamId: teamId });
    const { executor, eventBus } = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 3,
      intervalUnit: "month",
    };
    let revoked = false;
    setAfterBatchCommit(() => {
      if (!revoked) {
        revoked = true;
        sqlite.prepare("UPDATE assets SET shared_team_id = NULL WHERE id = ?").run(assetId);
      }
    });

    const [first, second] = await Promise.all([
      execute(executor, command),
      execute(executor, command),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBeInstanceOf(ForbiddenError);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance_tasks").get()).toEqual({
      count: 1,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_operation_journal").get()).toEqual({
      count: 1,
    });
    expect(eventBus.events).toHaveLength(1);
  });
});
