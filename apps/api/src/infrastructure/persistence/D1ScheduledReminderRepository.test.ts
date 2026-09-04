import {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { ScheduledReminderRecord } from "../../application/ports/ScheduledReminderRepository.ts";
import { D1ScheduledReminderRepository } from "./D1ScheduledReminderRepository.ts";

type BoundStatement = { query: string; values: unknown[] };

function harness(rows: unknown[] = []) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(rows[0] ?? null),
        all: vi.fn().mockResolvedValue({ results: rows }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
    },
  }));
  return { db: { prepare } as unknown as D1Database, statements };
}

function record(): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-20",
    fireAt: "2026-07-13",
    status: "pending",
    snoozedUntil: null,
    lastEventId: "evt-1",
    lastEventOccurredAt: new Date("2026-07-01T00:00:00.000Z"),
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  };
}

describe("D1ScheduledReminderRepository", () => {
  it("upserts a reminder by id", async () => {
    const { db, statements } = harness();
    const r = record();
    await new D1ScheduledReminderRepository(db).save(r);
    expect(statements[0]?.query).toContain("INSERT INTO scheduled_reminders");
    expect(statements[0]?.query).toContain("ON CONFLICT (id) DO UPDATE");
    expect(statements[0]?.values).toContain("Oil change");
  });

  it("finds only pending due reminders on or before today", async () => {
    const { db, statements } = harness([]);
    await new D1ScheduledReminderRepository(db).findDue("2026-07-13");
    expect(statements[0]?.query).toContain("status = 'pending' AND fire_at <= ?");
    // Effective fire date = max(fireAt, snoozedUntil).
    expect(statements[0]?.query).toContain("(snoozed_until IS NULL OR snoozed_until <= ?)");
    expect(statements[0]?.values).toEqual(["2026-07-13", "2026-07-13"]);
  });

  it("finds the pending reminder for a task", async () => {
    const { db, statements } = harness([]);
    const taskId = MaintenanceTaskId.generate();
    await new D1ScheduledReminderRepository(db).findPendingByTask(taskId);
    expect(statements[0]?.query).toContain("maintenance_task_id = ? AND status = 'pending'");
    expect(statements[0]?.values).toEqual([taskId]);
  });

  it("stamps updated_at from the caller-provided instant, not the wall clock", async () => {
    const { db, statements } = harness();
    const id = ScheduledReminderId.generate();
    const at = new Date("2026-07-15T09:30:00.000Z");
    await new D1ScheduledReminderRepository(db).updateStatus(id, "superseded", at);
    // Every non-snooze transition drops the snooze with the cycle.
    expect(statements[0]?.query).toContain("SET status = ?, snoozed_until = NULL, updated_at = ?");
    expect(statements[0]?.values).toEqual(["superseded", at.toISOString(), id]);
  });

  it("finds the task's current cycle, newest event first", async () => {
    const { db, statements } = harness();
    const taskId = MaintenanceTaskId.generate();
    await new D1ScheduledReminderRepository(db).findCurrentByTask(taskId);
    expect(statements[0]?.query).toContain("WHERE maintenance_task_id = ?");
    expect(statements[0]?.query).toContain(
      "ORDER BY last_event_occurred_at DESC, created_at DESC, id DESC",
    );
    expect(statements[0]?.query).toContain("LIMIT 1");
    expect(statements[0]?.values).toEqual([taskId]);
  });

  it("finds a cycle row by (task, nextDue)", async () => {
    const { db, statements } = harness();
    const taskId = MaintenanceTaskId.generate();
    await new D1ScheduledReminderRepository(db).findByTaskAndCycle(taskId, "2026-07-20");
    expect(statements[0]?.query).toContain("WHERE maintenance_task_id = ? AND next_due = ?");
    expect(statements[0]?.values).toEqual([taskId, "2026-07-20"]);
  });

  it("snoozes conditionally on the expected status and reports whether it applied", async () => {
    const { db, statements } = harness();
    const id = ScheduledReminderId.generate();
    const at = new Date("2026-07-15T09:30:00.000Z");
    const applied = await new D1ScheduledReminderRepository(db).snooze(
      id,
      "fired",
      "2026-07-16",
      at,
    );

    expect(statements[0]?.query).toContain(
      "SET status = 'pending', snoozed_until = ?, updated_at = ?",
    );
    expect(statements[0]?.query).toContain("WHERE id = ? AND status = ?");
    expect(statements[0]?.values).toEqual(["2026-07-16", at.toISOString(), id, "fired"]);
    expect(applied).toBe(true);
  });

  it("returns false when the conditional snooze updated no rows", async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) }),
      })),
    } as unknown as D1Database;
    const applied = await new D1ScheduledReminderRepository(db).snooze(
      ScheduledReminderId.generate(),
      "pending",
      "2026-07-16",
      new Date(),
    );
    expect(applied).toBe(false);
  });

  it("updates a cycle's snapshot in place without touching status or snooze", async () => {
    const { db, statements } = harness();
    const id = ScheduledReminderId.generate();
    const at = new Date("2026-07-15T09:30:00.000Z");
    await new D1ScheduledReminderRepository(db).updateSnapshot(
      id,
      {
        assetName: "Truck",
        assetType: "vehicle",
        taskTitle: "Oil change (renamed)",
        actorId: "u-1",
      },
      { lastEventId: "evt-9", lastEventOccurredAt: at },
      at,
    );
    expect(statements[0]?.query).toContain("SET asset_name = ?, asset_type = ?, task_title = ?");
    expect(statements[0]?.query).not.toContain("status");
    expect(statements[0]?.query).not.toContain("snoozed_until");
    expect(statements[0]?.query).toContain("WHERE id = ?");
    expect(statements[0]?.values).toEqual([
      "Truck",
      "vehicle",
      "Oil change (renamed)",
      "u-1",
      "evt-9",
      at.toISOString(),
      at.toISOString(),
      id,
    ]);
  });

  it("resolves one current row per task for the dashboard reader", async () => {
    const { db, statements } = harness([
      row({ maintenance_task_id: "task-1", snoozed_until: "2026-07-16" }),
      row({ maintenance_task_id: "task-1" }),
      row({ maintenance_task_id: "task-2", snoozed_until: null }),
    ]);
    const snoozes = await new D1ScheduledReminderRepository(db).snoozedUntilByTask([
      MaintenanceTaskId.from("task-1"),
      MaintenanceTaskId.from("task-2"),
    ]);

    expect(statements[0]?.query).toContain("WHERE maintenance_task_id IN (?, ?)");
    // The first (newest) row per task wins.
    expect(snoozes.get(MaintenanceTaskId.from("task-1"))).toBe("2026-07-16");
    expect(snoozes.has(MaintenanceTaskId.from("task-2"))).toBe(false);
  });

  it("round-trips a snoozed row through findDue", async () => {
    const { db } = harness([row({ snoozed_until: "2026-07-14" })]);
    const due = await new D1ScheduledReminderRepository(db).findDue("2026-07-14");
    expect(due[0]?.snoozedUntil).toBe("2026-07-14");
  });
});

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ScheduledReminderId.generate(),
    owner_id: "owner-1",
    actor_id: "system",
    maintenance_task_id: "task-1",
    asset_id: "asset-1",
    asset_name: "Truck",
    asset_type: "vehicle",
    task_title: "Oil change",
    next_due: "2026-07-20",
    fire_at: "2026-07-13",
    snoozed_until: null,
    status: "pending",
    last_event_id: "evt-1",
    last_event_occurred_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}
