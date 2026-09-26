import { DatabaseSync } from "node:sqlite";
import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type {
  AgentMutationCommand,
  AgentMutationReceipt,
} from "../../../application/ports/AgentOperationExecutor.ts";
import { D1TeamRepository } from "../../persistence/D1TeamRepository.ts";
import { D1MaintenanceWriteGate } from "../../persistence/D1MaintenanceWriteGate.ts";
import { handleNotificationEventBatch } from "../../notifications/NotificationEventQueueConsumer.ts";
import {
  isNotificationEventMessage,
  NOTIFICATION_EVENTS_QUEUE_NAME,
  type NotificationEventMessage,
} from "../../notifications/NotificationEventMessage.ts";
import { D1AgentOperationExecutor } from "../mutations/D1AgentOperationExecutor.ts";
import { D1AgentOperationRecovery } from "./D1AgentOperationRecovery.ts";

const ACTOR = UserId.from("40000000-0000-4000-8000-000000000001");
const TODAY = "2026-06-11";
const PRIVATE_STREET = "44 Hidden Road";

type SqlStatement = D1PreparedStatement & { query: string; values: unknown[] };
type SqlHarness = { sqlite: DatabaseSync; db: D1Database };

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
    CREATE TABLE mutation_guards (name TEXT PRIMARY KEY, assertion INTEGER NOT NULL CHECK (assertion = 1));
    CREATE TABLE activity_event_outbox (
      id TEXT PRIMARY KEY, consumer TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE notification_event_outbox (
      id TEXT PRIMARY KEY, consumer TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      sent_at TEXT, delivered_at TEXT, last_error TEXT
    );
    CREATE TABLE notification_ingested_events (
      event_id TEXT PRIMARY KEY, maintenance_task_id TEXT NOT NULL, occurred_at TEXT NOT NULL, processed_at TEXT NOT NULL
    );
    CREATE TABLE scheduled_reminders (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_id TEXT NOT NULL, maintenance_task_id TEXT NOT NULL,
      asset_id TEXT NOT NULL, asset_name TEXT NOT NULL, asset_type TEXT NOT NULL, task_title TEXT NOT NULL,
      next_due TEXT NOT NULL, fire_at TEXT NOT NULL, snoozed_until TEXT, status TEXT NOT NULL,
      last_event_id TEXT NOT NULL, last_event_occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_scheduled_reminders_pending_task
      ON scheduled_reminders (maintenance_task_id) WHERE status = 'pending';
    CREATE TABLE agent_operation_journal (
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation_id TEXT NOT NULL,
      tool TEXT NOT NULL, input_hash TEXT NOT NULL, receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
      snapshot_version INTEGER NOT NULL, snapshots_json TEXT NOT NULL CHECK (json_valid(snapshots_json)),
      created_at TEXT NOT NULL, restored_at TEXT, PRIMARY KEY (actor_id, operation_id)
    );
  `);

  const makeStatement = (query: string, values: unknown[] = []): SqlStatement => {
    const statement = {
      query,
      values,
      bind: (...nextValues: unknown[]) => makeStatement(query, nextValues),
      run: () => {
        const result = sqlite.prepare(query).run(...(values as never[]));
        return Promise.resolve({ success: true, meta: { changes: Number(result.changes) } });
      },
      first: <T>() => {
        const row = sqlite.prepare(query).get(...(values as never[]));
        return Promise.resolve((row ?? null) as T | null);
      },
      all: <T>() => {
        const results = sqlite.prepare(query).all(...(values as never[])) as T[];
        return Promise.resolve({ results });
      },
    };
    return statement as unknown as SqlStatement;
  };
  const db = {
    prepare: (query: string) => makeStatement(query),
    batch: (statements: D1PreparedStatement[]) =>
      Promise.resolve().then(() => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const results = statements.map((statement) => {
            const bound = statement as SqlStatement;
            const result = sqlite.prepare(bound.query).run(...(bound.values as never[]));
            return { success: true, meta: { changes: Number(result.changes) } };
          });
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      }),
  } as unknown as D1Database;
  return { sqlite, db };
}

function createExecutor(db: D1Database): D1AgentOperationExecutor {
  return new D1AgentOperationExecutor({
    db,
    teams: new D1TeamRepository(db),
    eventBus: { publish: async () => {}, publishAll: async () => {}, subscribe: () => {} },
    dates: { today: () => TODAY },
    writeGate: new D1MaintenanceWriteGate(db),
  });
}

function seedUser(sqlite: DatabaseSync): void {
  sqlite
    .prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
    .run(ACTOR, "vertical@example.com", "Vertical Test", "2026-01-01T00:00:00.000Z");
}

function seedAsset(
  sqlite: DatabaseSync,
  metadata: Record<string, unknown> = { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
  revision: number | null = 0,
): AssetId {
  const assetId = AssetId.generate();
  sqlite
    .prepare(
      `INSERT INTO assets
       (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
    )
    .run(
      assetId,
      ACTOR,
      "Truck",
      String(metadata.kind),
      JSON.stringify(metadata),
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      revision,
    );
  return assetId;
}

function seedTask(
  sqlite: DatabaseSync,
  assetId: AssetId,
  options: {
    lastCompletedDate?: string | null;
    nextDue?: string;
    scheduleSeedDate?: string;
    initialLastCompletedDate?: string | null;
    nextDueOverride?: string | null;
    revision?: number;
  } = {},
): MaintenanceTaskId {
  const taskId = MaintenanceTaskId.generate();
  const lastCompletedDate = options.lastCompletedDate ?? null;
  sqlite
    .prepare(
      `INSERT INTO maintenance_tasks
       (id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due,
        created_at, schedule_seed_date, initial_last_completed_date, revision, next_due_override)
       VALUES (?, ?, ?, 'Replace furnace filter', 2, 'month', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      taskId,
      assetId,
      ACTOR,
      lastCompletedDate,
      options.nextDue ?? "2026-08-01",
      "2026-01-01T00:00:00.000Z",
      options.scheduleSeedDate ?? "2026-01-01",
      options.initialLastCompletedDate ?? null,
      options.revision ?? 0,
      options.nextDueOverride ?? null,
    );
  return taskId;
}

function seedRecord(
  sqlite: DatabaseSync,
  assetId: AssetId,
  taskId: MaintenanceTaskId,
  performedAt: string,
): MaintenanceRecordId {
  const recordId = MaintenanceRecordId.generate();
  sqlite
    .prepare(
      `INSERT INTO maintenance_records
       (id, asset_id, owner_id, title, performed_at, notes, created_at, task_id, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      recordId,
      assetId,
      ACTOR,
      "Changed filter",
      performedAt,
      "Initial notes",
      "2026-05-02T00:00:00.000Z",
      taskId,
    );
  return recordId;
}

async function executeAndRestore(
  db: D1Database,
  executor: D1AgentOperationExecutor,
  command: AgentMutationCommand,
): Promise<AgentMutationReceipt> {
  const result = await executor.execute(ACTOR, command);
  if (!result.ok) throw result.error;
  expect(result.value).toMatchObject({ operationId: command.operationId, replayed: false });
  const recovery = new D1AgentOperationRecovery(db);
  expect((await recovery.inspect(ACTOR, command.operationId)).tool).toBe(command.kind);
  expect((await recovery.recover(ACTOR, command.operationId)).status).toBe("dry_run_ready");
  const restored = await recovery.recover(ACTOR, command.operationId, { apply: true });
  expect(restored).toMatchObject({ status: "restored", operationId: command.operationId });
  return result.value;
}

async function deliverTaskEventsInReverseTimeOrder(
  sqlite: DatabaseSync,
  db: D1Database,
  taskId: MaintenanceTaskId,
): Promise<NotificationEventMessage[]> {
  const rows = sqlite
    .prepare(
      `SELECT payload FROM notification_event_outbox
       WHERE json_extract(payload, '$.maintenanceTaskId') = ?`,
    )
    .all(taskId) as Array<{ payload: string }>;
  const messages = rows.map((row) => {
    const payload: unknown = JSON.parse(row.payload);
    if (!isNotificationEventMessage(payload)) {
      throw new Error("SQLite outbox contained an invalid notification event");
    }
    return payload;
  });
  expect(messages.length).toBeGreaterThanOrEqual(2);
  messages.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const compensationTime = messages[0]?.occurredAt;
  const staleMutationTime = messages[messages.length - 1]?.occurredAt;
  if (compensationTime === undefined || staleMutationTime === undefined) {
    throw new Error("Expected source and recovery schedule conclusions");
  }
  expect(Date.parse(compensationTime)).toBeGreaterThan(Date.parse(staleMutationTime));

  let acknowledged = 0;
  let retried = 0;
  const queueMessages = messages.map((body, index) => ({
    id: `vertical-${index}`,
    timestamp: new Date(body.occurredAt),
    body,
    attempts: 1,
    ack: () => {
      acknowledged += 1;
    },
    retry: () => {
      retried += 1;
    },
  }));
  const batch = {
    queue: NOTIFICATION_EVENTS_QUEUE_NAME,
    messages: queueMessages,
    metadata: {
      metrics: {
        backlogCount: queueMessages.length,
        backlogBytes: 0,
        oldestMessageTimestamp: new Date(staleMutationTime),
      },
    },
    retryAll: () => {
      retried += 1;
    },
    ackAll: () => {
      acknowledged += 1;
    },
  } satisfies MessageBatch<unknown>;
  await handleNotificationEventBatch(batch, db);
  expect(acknowledged).toBe(messages.length);
  expect(retried).toBe(0);
  return messages;
}

function readTask(
  sqlite: DatabaseSync,
  taskId: MaintenanceTaskId,
): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM maintenance_tasks WHERE id = ?").get(taskId);
}

function readRecord(
  sqlite: DatabaseSync,
  recordId: MaintenanceRecordId,
): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM maintenance_records WHERE id = ?").get(recordId);
}

function readReminder(
  sqlite: DatabaseSync,
  taskId: MaintenanceTaskId,
): Record<string, unknown> | undefined {
  return sqlite
    .prepare(
      "SELECT * FROM scheduled_reminders WHERE maintenance_task_id = ? AND status = 'pending'",
    )
    .get(taskId);
}

describe("executor → private journal → operator recovery (real SQLite)", () => {
  it("restores create_asset by removing only the new asset", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_asset",
      operationId: crypto.randomUUID(),
      name: "New truck",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2022 },
    };

    const receipt = await executeAndRestore(db, executor, command);

    expect(
      sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(receipt.assetId),
    ).toBeUndefined();
    const restored = sqlite
      .prepare("SELECT restored_at FROM agent_operation_journal WHERE operation_id = ?")
      .get(command.operationId);
    expect(typeof restored?.restored_at).toBe("string");
    sqlite.close();
  });

  it("restores locality-only edit_asset while preserving the hidden property street", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite, {
      kind: "property",
      nickname: "Cabin",
      address: {
        street: PRIVATE_STREET,
        city: "Old Town",
        state: "UT",
        postalCode: "84000",
        country: "US",
      },
    });
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "edit_asset",
      operationId: crypto.randomUUID(),
      assetId,
      expectedRevision: 0,
      metadata: { kind: "property", address: { city: "New Town" } },
    };

    const receipt = await executeAndRestore(db, executor, command);

    const row = sqlite
      .prepare("SELECT metadata, revision FROM assets WHERE id = ?")
      .get(assetId) as {
      metadata: string;
      revision: number;
    };
    expect(JSON.parse(row.metadata)).toMatchObject({
      nickname: "Cabin",
      address: { street: PRIVATE_STREET, city: "Old Town" },
    });
    expect(row.revision).toBe(receipt.appliedRevision + 1);
    expect(JSON.stringify(receipt)).not.toContain(PRIVATE_STREET);
    sqlite.close();
  });

  it("marks a no-op edit on a legacy NULL-revision asset restored without changing its row", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite, undefined, null);
    const operationId = crypto.randomUUID();
    const originalRow = sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
    const executor = createExecutor(db);
    const result = await executor.execute(ACTOR, {
      kind: "edit_asset",
      operationId,
      assetId,
      expectedRevision: 0,
      metadata: { kind: "vehicle", make: "Ram" },
    });
    if (!result.ok) throw result.error;
    expect(result.value.appliedRevision).toBe(0);
    expect(sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(assetId)).toEqual(originalRow);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()?.count).toBe(
      0,
    );
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM notification_event_outbox").get()?.count,
    ).toBe(0);

    const recovery = new D1AgentOperationRecovery(db);
    expect(await recovery.recover(ACTOR, operationId)).toMatchObject({
      status: "dry_run_ready",
      changedRows: 0,
    });
    expect(await recovery.recover(ACTOR, operationId, { apply: true })).toMatchObject({
      status: "restored",
      changedRows: 0,
    });
    expect(sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(assetId)).toEqual(originalRow);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM activity_event_outbox").get()?.count).toBe(
      0,
    );
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM notification_event_outbox").get()?.count,
    ).toBe(0);
    const journal = sqlite
      .prepare(
        "SELECT restored_at FROM agent_operation_journal WHERE actor_id = ? AND operation_id = ?",
      )
      .get(ACTOR, operationId);
    expect(typeof journal?.restored_at).toBe("string");
    sqlite.close();
  });

  it("restores create_maintenance_task and ignores its stale create event after its delete conclusion", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite);
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "create_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      title: "Replace filter",
      intervalValue: 2,
      intervalUnit: "month",
    };

    const receipt = await executeAndRestore(db, executor, command);
    const taskId = MaintenanceTaskId.from(receipt.entityId);
    const messages = await deliverTaskEventsInReverseTimeOrder(sqlite, db, taskId);

    expect(messages[0]?.type).toBe("MaintenanceTaskDeleted");
    expect(readTask(sqlite, taskId)).toBeUndefined();
    expect(readReminder(sqlite, taskId)).toBeUndefined();
    sqlite.close();
  });

  it("restores edit_maintenance_task and the reminder to the prior schedule after reverse delivery", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, assetId, {
      lastCompletedDate: "2026-04-01",
      nextDue: "2026-06-01",
    });
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "edit_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      expectedRevision: 0,
      title: "Replace HVAC filter",
      intervalValue: 3,
    };

    await executeAndRestore(db, executor, command);
    const messages = await deliverTaskEventsInReverseTimeOrder(sqlite, db, taskId);

    expect(messages[0]?.type).toBe("MaintenanceTaskUpdated");
    expect(readTask(sqlite, taskId)).toMatchObject({
      title: "Replace furnace filter",
      interval_value: 2,
      next_due: "2026-06-01",
      revision: 2,
    });
    expect(readReminder(sqlite, taskId)).toMatchObject({ next_due: "2026-06-01" });
    sqlite.close();
  });

  it("restores reschedule_maintenance_task, including clearing the one-cycle override", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, assetId, {
      lastCompletedDate: "2026-04-01",
      nextDue: "2026-06-01",
      nextDueOverride: null,
    });
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "reschedule_maintenance_task",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      expectedRevision: 0,
      nextDue: "2026-09-15",
    };

    await executeAndRestore(db, executor, command);
    const messages = await deliverTaskEventsInReverseTimeOrder(sqlite, db, taskId);

    expect(messages[0]?.type).toBe("MaintenanceTaskUpdated");
    expect(readTask(sqlite, taskId)).toMatchObject({
      next_due: "2026-06-01",
      next_due_override: null,
      revision: 2,
    });
    expect(readReminder(sqlite, taskId)).toMatchObject({ next_due: "2026-06-01" });
    sqlite.close();
  });

  it("restores a linked record_maintenance mutation and reverses task advancement/reminder schedule", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, assetId, {
      lastCompletedDate: "2026-04-01",
      initialLastCompletedDate: "2026-04-01",
      nextDue: "2026-06-01",
      scheduleSeedDate: "2026-04-01",
    });
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "record_maintenance",
      operationId: crypto.randomUUID(),
      assetId,
      taskId,
      expectedTaskRevision: 0,
      title: "Replaced filter",
      performedAt: "2026-06-09",
      notes: "Routine replacement",
    };

    const receipt = await executeAndRestore(db, executor, command);
    const recordId = MaintenanceRecordId.from(receipt.entityId);
    const messages = await deliverTaskEventsInReverseTimeOrder(sqlite, db, taskId);

    expect(messages[0]?.type).toBe("MaintenanceTaskUpdated");
    expect(readRecord(sqlite, recordId)).toBeUndefined();
    expect(readTask(sqlite, taskId)).toMatchObject({
      last_completed_date: "2026-04-01",
      next_due: "2026-06-01",
      revision: 2,
    });
    expect(readReminder(sqlite, taskId)).toMatchObject({ next_due: "2026-06-01" });
    sqlite.close();
  });

  it("restores edit_maintenance_record and linked reconciliation while preserving the prior record and schedule", async () => {
    const { sqlite, db } = createSqlHarness();
    seedUser(sqlite);
    const assetId = seedAsset(sqlite);
    const taskId = seedTask(sqlite, assetId, {
      lastCompletedDate: "2026-06-01",
      initialLastCompletedDate: null,
      nextDue: "2026-08-01",
      scheduleSeedDate: "2026-01-01",
    });
    const recordId = seedRecord(sqlite, assetId, taskId, "2026-06-01");
    const executor = createExecutor(db);
    const command: AgentMutationCommand = {
      kind: "edit_maintenance_record",
      operationId: crypto.randomUUID(),
      assetId,
      recordId,
      expectedRevision: 0,
      performedAt: "2026-05-15",
      notes: null,
    };

    await executeAndRestore(db, executor, command);
    const messages = await deliverTaskEventsInReverseTimeOrder(sqlite, db, taskId);

    expect(messages[0]?.type).toBe("MaintenanceTaskUpdated");
    expect(readRecord(sqlite, recordId)).toMatchObject({
      title: "Changed filter",
      performed_at: "2026-06-01",
      notes: "Initial notes",
      task_id: taskId,
      revision: 2,
    });
    expect(readTask(sqlite, taskId)).toMatchObject({
      last_completed_date: "2026-06-01",
      next_due: "2026-08-01",
      revision: 2,
    });
    expect(readReminder(sqlite, taskId)).toMatchObject({ next_due: "2026-08-01" });
    sqlite.close();
  });
});
