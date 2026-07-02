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

function harness(allResults: unknown[][] = []) {
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
  const batch = vi.fn().mockResolvedValue([]);
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

function input(overrides: Partial<ReminderSweepPersistenceInput> = {}): ReminderSweepPersistenceInput {
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
    expect(statements[0]?.values).toEqual(["2026-07-02"]);
    expect(due).toEqual([
      expect.objectContaining({
        id: ScheduledReminderId.from("reminder-1"),
        ownerId: UserId.from("owner-1"),
        maintenanceTaskId: MaintenanceTaskId.from("task-1"),
      }),
    ]);
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
    expect(batchedStatements).toHaveLength(4);
    expect(statements[0]?.query).toContain("INSERT INTO notifications");
    expect(statements[0]?.query).toContain("email_batch_id");
    expect(statements[1]?.query).toContain("UPDATE scheduled_reminders SET status = 'fired'");
    expect(statements[2]?.query).toContain("INSERT INTO email_batches");
    expect(statements[3]?.query).toContain("INSERT OR IGNORE INTO notification_email_outbox");
    expect(statements[3]?.values[0]).toBe(batchId);
    expect(statements[3]?.values[1]).toBe(batchId);
    expect(statements[3]?.values[2]).toBe(ownerId);
    expect(isReminderEmailMessage(JSON.parse(String(statements[3]?.values[3])))).toBe(true);
    expect(result.createdNotifications).toEqual([expect.objectContaining({ id: n.id, ownerId })]);
    expect(result.emailBatches).toEqual([
      expect.objectContaining({ id: batchId, ownerId, notificationCount: 1, status: "pending" }),
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
    expect(result).toEqual({ createdNotifications: [], emailBatches: [] });
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
