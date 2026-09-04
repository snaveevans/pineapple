// Behavioral tests for the reminder fire/snooze predicates, run against real
// SQLite (node:sqlite) instead of SQL-text assertions. The DDL below mirrors
// migrations 0009_notifications.sql and 0022_scheduled_reminder_snooze.sql
// (migrations are append-only, so this schema does not drift) — the mock-D1
// suites pin query shape; these pin what the queries DO.
import {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { NotificationRecord } from "../../application/ports/NotificationRepository.ts";
import { D1ScheduledReminderRepository } from "./D1ScheduledReminderRepository.ts";
import { D1ReminderSweepStore } from "./D1ReminderSweepStore.ts";

// ── schema (migrations 0009 + 0022) ─────────────────────────────────────────

const SCHEMA = `
CREATE TABLE scheduled_reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  maintenance_task_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  next_due TEXT NOT NULL,
  fire_at TEXT NOT NULL,
  snoozed_until TEXT,
  status TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  last_event_occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_scheduled_reminders_pending_task
  ON scheduled_reminders (maintenance_task_id) WHERE status = 'pending';
CREATE INDEX idx_scheduled_reminders_task ON scheduled_reminders (maintenance_task_id);
CREATE INDEX idx_scheduled_reminders_sweep ON scheduled_reminders (status, fire_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  maintenance_task_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  next_due TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  email_batch_id TEXT
);
CREATE UNIQUE INDEX idx_notifications_task_cycle
  ON notifications (maintenance_task_id, next_due);

CREATE TABLE email_batches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  suppress_reason TEXT,
  notification_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_email_outbox (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// ── D1-shaped adapter over node:sqlite ──────────────────────────────────────

/**
 * D1-shaped adapter: positional binding, `{ meta: { changes }, results }`
 * statement results, sequential `batch`. Reads and writes each execute exactly
 * once — a double-executed conditional UPDATE would match 0 rows.
 */
function d1OverSqlite(db: DatabaseSync): D1Database {
  const adapt = (sql: string) => {
    const stmt = db.prepare(sql);
    const isRead = /^\s*(select|with)\b/i.test(sql);
    const bind = (...values: unknown[]) => {
      const params = values.map((value) =>
        value instanceof Date ? value.toISOString() : (value as string | null),
      );
      const run = () => {
        if (isRead) {
          const rows = stmt.all(...params);
          return { meta: { changes: 0 }, results: rows };
        }
        const writeResult = stmt.run(...params);
        return { meta: { changes: Number(writeResult.changes) }, results: [] };
      };
      return {
        first: () => (isRead ? (stmt.get(...params) ?? null) : null),
        all: () => ({ results: isRead ? stmt.all(...params) : [] }),
        run: () => Promise.resolve(run()),
      };
    };
    return { bind };
  };
  return {
    prepare: (sql: string) => adapt(sql),
    // D1 batch receives already-bound statements; each runs sequentially in an
    // implicit transaction.
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      const results: unknown[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  } as unknown as D1Database;
}

// ── fixtures ────────────────────────────────────────────────────────────────

const ISO = "2026-07-01T00:00:00.000Z";
const OWNER = "7d914909-c903-41a4-a13a-82cbd0f61851";

type ReminderInsert = {
  id: string;
  owner_id: string;
  actor_id: string;
  maintenance_task_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  task_title: string;
  next_due: string;
  fire_at: string;
  snoozed_until: string | null;
  status: string;
  last_event_id: string;
  last_event_occurred_at: string;
  created_at: string;
  updated_at: string;
};

function insertReminder(sqlite: DatabaseSync, overrides: Partial<ReminderInsert> = {}): string {
  const row: ReminderInsert = {
    id: crypto.randomUUID(),
    owner_id: OWNER,
    actor_id: "system",
    maintenance_task_id: "task-1",
    asset_id: "asset-1",
    asset_name: "Truck",
    asset_type: "vehicle",
    task_title: "Oil change",
    next_due: "2026-07-09",
    fire_at: "2026-07-02",
    snoozed_until: null,
    status: "pending",
    last_event_id: "evt-1",
    last_event_occurred_at: ISO,
    created_at: ISO,
    updated_at: ISO,
    ...overrides,
  };
  sqlite
    .prepare(
      `INSERT INTO scheduled_reminders
         (id, owner_id, actor_id, maintenance_task_id, asset_id, asset_name, asset_type,
          task_title, next_due, fire_at, snoozed_until, status, last_event_id,
          last_event_occurred_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.owner_id,
      row.actor_id,
      row.maintenance_task_id,
      row.asset_id,
      row.asset_name,
      row.asset_type,
      row.task_title,
      row.next_due,
      row.fire_at,
      row.snoozed_until,
      row.status,
      row.last_event_id,
      row.last_event_occurred_at,
      row.created_at,
      row.updated_at,
    );
  return row.id;
}

function insertNotification(
  sqlite: DatabaseSync,
  overrides: { id?: string; created_at?: string; read_at?: string | null } = {},
): string {
  const id = overrides.id ?? crypto.randomUUID();
  sqlite
    .prepare(
      `INSERT INTO notifications
         (id, owner_id, actor_id, type, maintenance_task_id, asset_id, asset_name, asset_type,
          task_title, next_due, created_at, read_at, email_batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      OWNER,
      "system",
      "maintenance_due_soon",
      "task-1",
      "asset-1",
      "Truck",
      "vehicle",
      "Oil change",
      "2026-07-09",
      overrides.created_at ?? ISO,
      overrides.read_at ?? ISO,
      null,
    );
  return id;
}

function notificationRecord(overrides: { id?: string; createdAt?: Date } = {}): NotificationRecord {
  return {
    id: NotificationId.from(overrides.id ?? crypto.randomUUID()),
    ownerId: UserId.from(OWNER),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.from("task-1"),
    assetId: AssetId.from("asset-1"),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-09",
    createdAt: overrides.createdAt ?? new Date(ISO),
    readAt: null,
  };
}

function scheduledReminderRow(sqlite: DatabaseSync, id: string): Record<string, unknown> {
  return sqlite.prepare("SELECT * FROM scheduled_reminders WHERE id = ?").get(id) as Record<
    string,
    unknown
  >;
}

describe("reminder fire predicates (real SQLite)", () => {
  it("does not fire a reminder whose natural fireAt is still ahead, even after its snooze expires (the max rule)", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    // Snooze expired relative to "today", but the reminder was not going to
    // fire until 2026-07-10 — a snooze never accelerates.
    insertReminder(sqlite, { fire_at: "2026-07-10", snoozed_until: "2026-07-03" });
    const store = new D1ReminderSweepStore(d1OverSqlite(sqlite));

    await expect(store.findDue("2026-07-03")).resolves.toEqual([]);
    await expect(store.findDue("2026-07-09")).resolves.toEqual([]);
    await expect(store.findDue("2026-07-10")).resolves.toHaveLength(1);
  });

  it("skips a snoozed reminder until expiry and fires it on the expiry date", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    insertReminder(sqlite, { fire_at: "2026-07-02", snoozed_until: "2026-07-03" });
    const store = new D1ReminderSweepStore(d1OverSqlite(sqlite));

    // The reminder's fireAt has arrived, but the snooze defers today's sweep.
    await expect(store.findDue("2026-07-02")).resolves.toEqual([]);
    await expect(store.findDue("2026-07-03")).resolves.toHaveLength(1);
  });

  it("fires an unsnoozed due reminder, marks it fired with the snooze cleared, and is idempotent on repeat", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    const reminderId = insertReminder(sqlite, {
      fire_at: "2026-07-02",
      snoozed_until: "2026-07-02",
    });
    const store = new D1ReminderSweepStore(d1OverSqlite(sqlite));
    const due = await store.findDue("2026-07-02");
    const dueReminder = due[0];
    if (!dueReminder) throw new Error("expected a due reminder");

    const persisted = await store.recordDueReminderSweep({
      candidates: [
        {
          reminderId: dueReminder.id,
          emailBatchId: EmailBatchId.from("batch-1"),
          notification: notificationRecord({ id: "notification-1" }),
        },
      ],
      emailBatches: [
        {
          id: EmailBatchId.from("batch-1"),
          ownerId: UserId.from(OWNER),
          createdAt: new Date(ISO),
          updatedAt: new Date(ISO),
        },
      ],
      updatedAt: new Date(ISO),
      today: "2026-07-02",
    });

    expect(persisted.createdNotifications).toHaveLength(1);
    const fired = scheduledReminderRow(sqlite, reminderId);
    expect(fired.status).toBe("fired");
    expect(fired.snoozed_until).toBeNull();

    // The fired reminder is no longer due, so a repeat sweep is a no-op.
    expect(await store.findDue("2026-07-02")).toEqual([]);
  });

  it("re-fires a snoozed fired cycle by re-activating the same inbox row, not a duplicate", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    // The cycle already fired and created its inbox row, which was read.
    const reminderId = insertReminder(sqlite, { status: "fired", snoozed_until: null });
    const originalNotificationId = insertNotification(sqlite);
    const repo = new D1ScheduledReminderRepository(d1OverSqlite(sqlite));

    // Snooze re-arms the fired cycle.
    expect(
      await repo.snooze(ScheduledReminderId.from(reminderId), "fired", "2026-07-03", new Date(ISO)),
    ).toBe(true);
    const rearmed = scheduledReminderRow(sqlite, reminderId);
    expect(rearmed.status).toBe("pending");
    expect(rearmed.snoozed_until).toBe("2026-07-03");

    // The sweep on/after expiry fires it again: same inbox row re-activated
    // (unread, re-dated, re-linked batch) — never a second row. The re-fire
    // event carries the persisted row's id, not the candidate's fresh one.
    const store = new D1ReminderSweepStore(d1OverSqlite(sqlite));
    const due = await store.findDue("2026-07-03");
    const dueReminder = due[0];
    if (!dueReminder) throw new Error("expected a due reminder");
    expect(due.map((r) => r.id)).toEqual([reminderId]);
    const persisted = await store.recordDueReminderSweep({
      candidates: [
        {
          reminderId: dueReminder.id,
          emailBatchId: EmailBatchId.from("batch-2"),
          notification: notificationRecord({
            id: "fresh-candidate-id",
            // The real sweep stamps the candidate with the sweep instant; the
            // re-activation refreshes the row's created_at to it.
            createdAt: new Date("2026-07-03T00:00:00.000Z"),
          }),
        },
      ],
      emailBatches: [
        {
          id: EmailBatchId.from("batch-2"),
          ownerId: UserId.from(OWNER),
          createdAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        },
      ],
      updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      today: "2026-07-03",
    });

    expect(persisted.createdNotifications).toEqual([]);
    expect(persisted.reactivatedNotifications.map((n) => n.id)).toEqual([
      NotificationId.from(originalNotificationId),
    ]);

    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM notifications").get() as { n: number };
    expect(count.n).toBe(1);
    const row = sqlite.prepare("SELECT * FROM notifications").get() as Record<string, unknown>;
    expect(row.read_at).toBeNull();
    expect(row.created_at).toBe("2026-07-03T00:00:00.000Z");
    expect(row.email_batch_id).toBe("batch-2");
  });

  it("rejects a re-arm that collides with a newer pending cycle via the unique index", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    const firedId = insertReminder(sqlite, {
      status: "fired",
      next_due: "2026-07-02",
      last_event_occurred_at: "2026-06-01T00:00:00.000Z",
    });
    // A newer cycle was created concurrently: it is the current pending row.
    insertReminder(sqlite, {
      next_due: "2026-08-01",
      fire_at: "2026-07-25",
      status: "pending",
      last_event_occurred_at: "2026-06-02T00:00:00.000Z",
    });
    const repo = new D1ScheduledReminderRepository(d1OverSqlite(sqlite));

    // The stale re-arm violates the one-pending-per-task index and throws —
    // the use-case contract the retry loop treats as a lost race.
    await expect(
      repo.snooze(ScheduledReminderId.from(firedId), "fired", "2026-07-03", new Date(ISO)),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("resolves the current cycle as the newest row regardless of status", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(SCHEMA);
    insertReminder(sqlite, {
      status: "fired",
      last_event_occurred_at: "2026-06-01T00:00:00.000Z",
    });
    const newer = insertReminder(sqlite, {
      next_due: "2026-08-01",
      fire_at: "2026-07-25",
      status: "pending",
      last_event_occurred_at: "2026-06-02T00:00:00.000Z",
    });
    const repo = new D1ScheduledReminderRepository(d1OverSqlite(sqlite));

    const current = await repo.findCurrentByTask(MaintenanceTaskId.from("task-1"));
    expect(current?.id).toBe(newer);
    expect(current?.status).toBe("pending");
  });
});
