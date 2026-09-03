import { describe, expect, it, vi } from "vitest";
import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import {
  ACTIVITY_HISTORY_DLQ_NAME,
  ACTIVITY_HISTORY_QUEUE_NAME,
  type ActivityEventMessage,
  isActivityEventMessage,
  toActivityEventMessage,
} from "./ActivityEventMessage.ts";
import { MaintenanceTaskRescheduled } from "../../domain/maintenance/events/MaintenanceTaskRescheduled.ts";
import { handleActivityQueueBatch } from "./ActivityQueueConsumer.ts";

const activityMessage: ActivityEventMessage = {
  id: "e2d3cf94-3779-43ea-b595-dac35dcba45a",
  type: "AssetCreated",
  occurredAt: "2026-06-09T18:25:24.887Z",
  assetId: "195d0ef0-47f5-439f-abfd-29f892c9a040",
  ownerId: "7d914909-c903-41a4-a13a-82cbd0f61851",
  actorId: "71afbc20-f2e0-4fc8-a989-278437cf792c",
  assetName: "Truck",
  assetType: "vehicle",
  activityEntryType: "asset_added",
};

function createDatabaseHarness(options: { failRuns?: number[] } = {}) {
  let runCount = 0;
  const failedRuns = new Set(options.failRuns ?? []);
  const statements: { query: string; values: unknown[] }[] = [];
  const batch = vi.fn((statements: D1PreparedStatement[]) =>
    Promise.resolve(statements.map(() => ({ success: true }))),
  );
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        run: vi.fn(() => {
          runCount += 1;
          if (failedRuns.has(runCount)) throw new Error("D1 unavailable");
          return Promise.resolve({ success: true });
        }),
      };
    },
  }));
  const db = { prepare, batch } as unknown as D1Database & { batch: typeof batch };
  return { db, batch, statements };
}

function message(id: string, body: unknown, attempts = 1) {
  return {
    id,
    attempts,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function batch(queue: string, messages: ReturnType<typeof message>[]) {
  return { queue, messages } as unknown as MessageBatch<unknown>;
}

describe("handleActivityQueueBatch", () => {
  it("records valid activity events, marks the outbox delivered, and acknowledges the message", async () => {
    const { db, batch: d1Batch, statements } = createDatabaseHarness();
    const first = message("message-1", activityMessage);

    await handleActivityQueueBatch(batch(ACTIVITY_HISTORY_QUEUE_NAME, [first]), db);

    expect(first.ack).toHaveBeenCalledTimes(1);
    expect(first.retry).not.toHaveBeenCalled();
    expect(d1Batch).toHaveBeenCalledTimes(1);
    expect(d1Batch.mock.calls[0]?.[0]).toHaveLength(2);
    expect(statements[0]?.query).toContain("INSERT INTO activity_entries");
    expect(statements[1]?.query).toContain("UPDATE activity_event_outbox");
    expect(statements[1]?.values).toContain(activityMessage.id);
  });

  it("persists messages received from the DLQ as dead letters", async () => {
    const { db, statements } = createDatabaseHarness();
    const first = message("message-1", activityMessage, 5);

    await handleActivityQueueBatch(batch(ACTIVITY_HISTORY_DLQ_NAME, [first]), db);

    expect(first.ack).toHaveBeenCalledTimes(1);
    expect(first.retry).not.toHaveBeenCalled();
    expect(statements[0]?.query).toContain("INSERT OR IGNORE INTO dead_letters");
    expect(statements[0]?.values).toContain(ACTIVITY_HISTORY_DLQ_NAME);
    expect(statements[0]?.values).toContain("Queue retry limit exceeded");
  });

  it("isolates dead-letter persistence failures per malformed message", async () => {
    const { db } = createDatabaseHarness({ failRuns: [1] });
    const first = message("message-1", { type: "NotAnActivityEvent" });
    const second = message("message-2", { type: "NotAnActivityEvent" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await handleActivityQueueBatch(batch(ACTIVITY_HISTORY_QUEUE_NAME, [first, second]), db);
    } finally {
      consoleError.mockRestore();
    }

    expect(first.retry).toHaveBeenCalledTimes(1);
    expect(first.ack).not.toHaveBeenCalled();
    expect(second.ack).toHaveBeenCalledTimes(1);
    expect(second.retry).not.toHaveBeenCalled();
  });

  it("logs terminal DLQ persistence failures before retry exhaustion can discard the message", async () => {
    const { db } = createDatabaseHarness({ failRuns: [1] });
    const first = message("message-1", activityMessage, 3);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await handleActivityQueueBatch(batch(ACTIVITY_HISTORY_DLQ_NAME, [first]), db);
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 3,
          messageId: "message-1",
          queue: ACTIVITY_HISTORY_DLQ_NAME,
        }),
        "Activity terminal dead-letter persistence failed",
      );
    } finally {
      consoleError.mockRestore();
    }

    expect(first.retry).toHaveBeenCalledTimes(1);
    expect(first.ack).not.toHaveBeenCalled();
  });

  it("projects MaintenanceTaskRescheduled as exactly one task_rescheduled entry, never a completion", async () => {
    const { db, statements } = createDatabaseHarness();
    const domainEvent = MaintenanceTaskRescheduled({
      maintenanceTaskId: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Truck",
      assetType: "vehicle",
      title: "Oil change",
      nextDue: "2026-11-01",
      taskRevision: 1,
    });
    const msg = message("message-resched-1", toActivityEventMessage(domainEvent));

    await handleActivityQueueBatch(batch(ACTIVITY_HISTORY_QUEUE_NAME, [msg]), db);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();

    const entryInserts = statements.filter((s) => s.query.includes("INSERT INTO activity_entries"));
    expect(entryInserts).toHaveLength(1);
    expect(entryInserts[0]?.values).toContain("task_rescheduled");
    expect(entryInserts[0]?.values).toContain("Oil change");

    // A reschedule must never produce completion or maintenance-log evidence.
    expect(entryInserts.some((s) => s.values.includes("task_completed"))).toBe(false);
    expect(entryInserts.some((s) => s.values.includes("maintenance_logged"))).toBe(false);
  });

  it("routes a MaintenanceTaskRescheduled activity message through the real factory and validator", () => {
    const domainEvent = MaintenanceTaskRescheduled({
      maintenanceTaskId: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Truck",
      assetType: "vehicle",
      title: "Oil change",
      nextDue: "2026-11-01",
      taskRevision: 2,
    });
    const msg = toActivityEventMessage(domainEvent);
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe("MaintenanceTaskRescheduled");
    expect(msg?.activityEntryType).toBe("task_rescheduled");
    expect(isActivityEventMessage(msg)).toBe(true);
  });
});
