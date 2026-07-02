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
  } as unknown as Message<unknown> & {
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
});
