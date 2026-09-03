import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { handleNotificationEventBatch } from "./NotificationEventQueueConsumer.ts";
import {
  NOTIFICATION_EVENTS_DLQ_NAME,
  NOTIFICATION_EVENTS_QUEUE_NAME,
} from "./NotificationEventMessage.ts";

type BoundStatement = { query: string; values: unknown[] };

function dbHarness() {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
    },
  }));
  return { db: { prepare } as unknown as D1Database, statements };
}

function message(body: unknown) {
  return {
    id: "m1",
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as {
    ack: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
}

function validMessage() {
  return message({
    id: "evt-1",
    type: "MaintenanceTaskCreated",
    occurredAt: "2026-09-01T00:00:00.000Z",
    ownerId: UserId.generate(),
    actorId: UserId.generate(),
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-10-01",
  });
}

function rescheduledMessage() {
  return message({
    id: "evt-resched-1",
    type: "MaintenanceTaskRescheduled",
    occurredAt: "2026-09-02T00:00:00.000Z",
    ownerId: UserId.generate(),
    actorId: UserId.generate(),
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-11-01",
  });
}

function deadLetterCount(statements: BoundStatement[]) {
  return statements.filter((s) => s.query.includes("INSERT INTO notification_dead_letters")).length;
}

describe("handleNotificationEventBatch", () => {
  it("dead-letters a malformed message and acks it", async () => {
    const { db, statements } = dbHarness();
    const msg = message({ nope: true });

    await handleNotificationEventBatch(
      {
        queue: NOTIFICATION_EVENTS_QUEUE_NAME,
        messages: [msg],
      } as unknown as MessageBatch<unknown>,
      db,
    );

    expect(deadLetterCount(statements)).toBe(1);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("persists every message on the DLQ", async () => {
    const { db, statements } = dbHarness();
    const msg = validMessage();

    await handleNotificationEventBatch(
      { queue: NOTIFICATION_EVENTS_DLQ_NAME, messages: [msg] } as unknown as MessageBatch<unknown>,
      db,
    );

    expect(deadLetterCount(statements)).toBe(1);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("processes a valid message without dead-lettering", async () => {
    const { db, statements } = dbHarness();
    const msg = validMessage();

    await handleNotificationEventBatch(
      {
        queue: NOTIFICATION_EVENTS_QUEUE_NAME,
        messages: [msg],
      } as unknown as MessageBatch<unknown>,
      db,
    );

    expect(deadLetterCount(statements)).toBe(0);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("schedules a superseding reminder from a MaintenanceTaskRescheduled message without reading task storage", async () => {
    const { db, statements } = dbHarness();
    const msg = rescheduledMessage();

    await handleNotificationEventBatch(
      {
        queue: NOTIFICATION_EVENTS_QUEUE_NAME,
        messages: [msg],
      } as unknown as MessageBatch<unknown>,
      db,
    );

    expect(deadLetterCount(statements)).toBe(0);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();

    // The reschedule target becomes the pending reminder's nextDue (supersede
    // path), and the event is recorded as processed.
    const reminderInsert = statements.find((s) =>
      s.query.includes("INSERT INTO scheduled_reminders"),
    );
    expect(reminderInsert).toBeDefined();
    expect(reminderInsert?.values).toContain("2026-11-01");
    expect(
      statements.some((s) => s.query.includes("INSERT INTO notification_ingested_events")),
    ).toBe(true);

    // The durable consumer never reads maintenance-task storage back: no
    // statement in the whole batch touches maintenance_tasks.
    expect(statements.some((s) => s.query.includes("maintenance_tasks"))).toBe(false);
  });

  it("dead-letters a MaintenanceTaskRescheduled message missing nextDue", async () => {
    const { db, statements } = dbHarness();
    const body = {
      id: "evt-resched-1",
      type: "MaintenanceTaskRescheduled",
      occurredAt: "2026-09-02T00:00:00.000Z",
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      maintenanceTaskId: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      assetName: "Truck",
      assetType: "vehicle",
      taskTitle: "Oil change",
    };
    const msg = message(body);

    await handleNotificationEventBatch(
      {
        queue: NOTIFICATION_EVENTS_QUEUE_NAME,
        messages: [msg],
      } as unknown as MessageBatch<unknown>,
      db,
    );

    expect(deadLetterCount(statements)).toBe(1);
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});
