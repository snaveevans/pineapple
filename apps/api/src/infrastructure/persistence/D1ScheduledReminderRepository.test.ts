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
    expect(statements[0]?.values).toEqual(["2026-07-13"]);
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
    expect(statements[0]?.query).toContain(
      "UPDATE scheduled_reminders SET status = ?, updated_at = ?",
    );
    expect(statements[0]?.values).toEqual(["superseded", at.toISOString(), id]);
  });
});
