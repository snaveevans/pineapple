import {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "../../application/ports/NotificationRepository.ts";
import type {
  ReminderSweepPersistenceInput,
  ReminderSweepNotificationCandidate,
} from "../../application/ports/ReminderSweepStore.ts";
import { isReminderEmailMessage } from "../notifications/ReminderEmailMessage.ts";
import { D1ReminderSweepStore } from "./D1ReminderSweepStore.ts";

type BoundStatement = { query: string; values: unknown[] };

function harness(allResults: unknown[][] = [], batchResults: unknown[] = []) {
  const statements: BoundStatement[] = [];
  const results = [...allResults];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        all: vi.fn().mockImplementation(() => Promise.resolve({ results: results.shift() ?? [] })),
      };
    },
  }));
  const batch = vi.fn().mockResolvedValue(batchResults);
  return { db: { prepare, batch } as unknown as D1Database, statements, batch };
}

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: NotificationId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-09",
    createdAt: new Date("2026-07-02T10:30:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<ReminderSweepNotificationCandidate> = {}) {
  const emailBatchId = overrides.emailBatchId ?? EmailBatchId.generate();
  return {
    reminderId: overrides.reminderId ?? ScheduledReminderId.generate(),
    emailBatchId,
    notification: overrides.notification ?? notification(),
  };
}

function input(
  overrides: Partial<ReminderSweepPersistenceInput> = {},
): ReminderSweepPersistenceInput {
  const batchId = EmailBatchId.generate();
  const ownerId = UserId.generate();
  const candidates = overrides.candidates ?? [
    candidate({ emailBatchId: batchId, notification: notification({ ownerId }) }),
  ];
  return {
    candidates,
    emailBatches: overrides.emailBatches ?? [
      {
        id: batchId,
        ownerId,
        createdAt: new Date("2026-07-02T10:30:00.000Z"),
        updatedAt: new Date("2026-07-02T10:30:00.000Z"),
      },
    ],
    updatedAt: new Date("2026-07-02T10:30:00.000Z"),
  };
}

describe("D1ReminderSweepStore", () => {
  it("finds only due pending scheduled reminders", async () => {
    const { db, statements } = harness([
      [
        {
          id: "reminder-1",
          owner_id: "owner-1",
          actor_id: "source-user",
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
          last_event_occurred_at: "2026-06-01T00:00:00.000Z",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    ]);

    const due = await new D1ReminderSweepStore(db).findDue("2026-07-02");

    expect(statements[0]?.query).toContain("WHERE status = 'pending' AND fire_at <= ?");
    // Effective fire date = max(fireAt, snoozedUntil) — a snoozed reminder that
    // has not expired yet is filtered out here.
    expect(statements[0]?.query).toContain("(snoozed_until IS NULL OR snoozed_until <= ?)");
    expect(statements[0]?.values).toEqual(["2026-07-02", "2026-07-02"]);
    expect(due).toEqual([
      expect.objectContaining({
        id: ScheduledReminderId.from("reminder-1"),
        ownerId: UserId.from("owner-1"),
        maintenanceTaskId: MaintenanceTaskId.from("task-1"),
        snoozedUntil: null,
      }),
    ]);
  });

  it("maps a snoozed reminder row through with its snoozedUntil", async () => {
    const { db } = harness([
      [
        {
          id: "reminder-1",
          owner_id: "owner-1",
          actor_id: "source-user",
          maintenance_task_id: "task-1",
          asset_id: "asset-1",
          asset_name: "Truck",
          asset_type: "vehicle",
          task_title: "Oil change",
          next_due: "2026-07-09",
          fire_at: "2026-07-02",
          snoozed_until: "2026-07-02",
          status: "pending",
          last_event_id: "evt-1",
          last_event_occurred_at: "2026-06-01T00:00:00.000Z",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    ]);

    const due = await new D1ReminderSweepStore(db).findDue("2026-07-02");
    expect(due[0]?.snoozedUntil).toBe("2026-07-02");
  });

  it("atomically inserts notifications, fires reminders, creates one batch, and enqueues one outbound job", async () => {
    const ownerId = UserId.generate();
    const batchId = EmailBatchId.generate();
    const n = notification({ ownerId });
    const record = input({
      candidates: [candidate({ emailBatchId: batchId, notification: n })],
      emailBatches: [
        {
          id: batchId,
          ownerId,
          createdAt: new Date("2026-07-02T10:30:00.000Z"),
          updatedAt: new Date("2026-07-02T10:30:00.000Z"),
        },
      ],
    });
    const { db, statements, batch } = harness([
      [notificationRow(n)],
      [emailBatchRow({ id: batchId, owner_id: ownerId, notification_count: 1 })],
    ]);

    const result = await new D1ReminderSweepStore(db).recordDueReminderSweep(record);

    expect(batch).toHaveBeenCalledOnce();
    const batchedStatements = batch.mock.calls[0]?.[0] as D1PreparedStatement[];
    // 1 pre-select (created vs re-activated) + upsert + fire + batch + outbox.
    expect(batchedStatements).toHaveLength(5);
    expect(statements[0]?.query).toContain(
      "SELECT id, maintenance_task_id, next_due FROM notifications",
    );
    expect(statements[1]?.query).toContain("INSERT INTO notifications");
    expect(statements[1]?.query).toContain("email_batch_id");
    // A re-fired cycle re-activates its existing inbox row instead of skipping.
    expect(statements[1]?.query).toContain(
      "ON CONFLICT (maintenance_task_id, next_due) DO UPDATE SET",
    );
    expect(statements[1]?.query).toContain("read_at = NULL");
    expect(statements[1]?.query).toContain("created_at = excluded.created_at");
    expect(statements[1]?.query).toContain("email_batch_id = excluded.email_batch_id");
    // Firing clears the snooze so a fired row can never re-arm by accident.
    expect(statements[2]?.query).toContain(
      "SET status = 'fired', snoozed_until = NULL, updated_at = ?",
    );
    expect(statements[3]?.query).toContain("INSERT INTO email_batches");
    expect(statements[4]?.query).toContain("INSERT OR IGNORE INTO notification_email_outbox");
    expect(statements[4]?.values[0]).toBe(batchId);
    expect(statements[4]?.values[1]).toBe(batchId);
    expect(statements[4]?.values[2]).toBe(ownerId);
    expect(isReminderEmailMessage(JSON.parse(String(statements[4]?.values[3])))).toBe(true);
    expect(result.createdNotifications).toEqual([expect.objectContaining({ id: n.id, ownerId })]);
    expect(result.reactivatedNotifications).toEqual([]);
    expect(result.emailBatches).toEqual([
      expect.objectContaining({ id: batchId, ownerId, notificationCount: 1, status: "pending" }),
    ]);
  });

  it("re-fires a snoozed cycle by re-activating its existing inbox row, not a duplicate", async () => {
    const ownerId = UserId.generate();
    const batchId = EmailBatchId.generate();
    const n = notification({ ownerId });
    const record = input({
      candidates: [candidate({ emailBatchId: batchId, notification: n })],
      emailBatches: [
        {
          id: batchId,
          ownerId,
          createdAt: new Date("2026-07-02T10:30:00.000Z"),
          updatedAt: new Date("2026-07-02T10:30:00.000Z"),
        },
      ],
    });
    // Pre-select inside the same transaction finds the cycle's existing row —
    // the re-fire re-activates it (carrying its existing notification id)
    // instead of inserting a duplicate.
    const { db, batch } = harness(
      [
        [notificationRow(n)],
        [emailBatchRow({ id: batchId, owner_id: ownerId, notification_count: 1 })],
      ],
      [
        {
          results: [
            {
              id: n.id,
              maintenance_task_id: n.maintenanceTaskId,
              next_due: n.nextDue,
            },
          ],
        },
      ],
    );

    const result = await new D1ReminderSweepStore(db).recordDueReminderSweep(record);

    expect(batch).toHaveBeenCalledOnce();
    expect(result.createdNotifications).toEqual([]);
    expect(result.reactivatedNotifications).toEqual([expect.objectContaining({ id: n.id })]);
    expect(result.emailBatches).toEqual([
      expect.objectContaining({ id: batchId, ownerId, notificationCount: 1 }),
    ]);
  });

  it("does nothing when there are no due candidates", async () => {
    const { db, batch } = harness();
    const result = await new D1ReminderSweepStore(db).recordDueReminderSweep({
      candidates: [],
      emailBatches: [],
      updatedAt: new Date("2026-07-02T10:30:00.000Z"),
    });

    expect(batch).not.toHaveBeenCalled();
    expect(result).toEqual({
      createdNotifications: [],
      reactivatedNotifications: [],
      emailBatches: [],
    });
  });
});

function notificationRow(n: NotificationRecord) {
  return {
    id: n.id,
    owner_id: n.ownerId,
    actor_id: n.actorId,
    type: n.type,
    maintenance_task_id: n.maintenanceTaskId,
    asset_id: n.assetId,
    asset_name: n.assetName,
    asset_type: n.assetType,
    task_title: n.taskTitle,
    next_due: n.nextDue,
    created_at: n.createdAt.toISOString(),
    read_at: n.readAt?.toISOString() ?? null,
  };
}

function emailBatchRow(overrides: Partial<Record<string, unknown>>) {
  return {
    id: EmailBatchId.generate(),
    owner_id: UserId.generate(),
    status: "pending",
    suppress_reason: null,
    notification_count: 1,
    created_at: "2026-07-02T10:30:00.000Z",
    updated_at: "2026-07-02T10:30:00.000Z",
    ...overrides,
  };
}
