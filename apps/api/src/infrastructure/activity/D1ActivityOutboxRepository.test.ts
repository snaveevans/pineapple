import { describe, expect, it, vi } from "vitest";
import type { ActivityEventMessage } from "./ActivityEventMessage.ts";
import { D1ActivityOutboxRepository } from "./D1ActivityOutboxRepository.ts";

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

function createDatabaseHarness(
  rows = [{ id: activityMessage.id, payload: JSON.stringify(activityMessage) }],
) {
  const statements: { query: string; values: unknown[] }[] = [];
  const batch = vi.fn(() => Promise.resolve([]));
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        all: vi.fn(() => Promise.resolve({ results: rows })),
        run: vi.fn(() => Promise.resolve({ success: true })),
      };
    },
  }));
  const db = { prepare, batch } as unknown as D1Database & { batch: typeof batch };
  return { db, batch, statements };
}

describe("D1ActivityOutboxRepository", () => {
  it("atomically claims pending rows before sending them", async () => {
    const { db, batch, statements } = createDatabaseHarness();
    const sendBatch = vi.fn(() => Promise.resolve(undefined));
    const queue = { sendBatch } as unknown as Queue<ActivityEventMessage>;

    await new D1ActivityOutboxRepository(db).relayPending(queue);

    expect(statements[0]?.query).toContain("UPDATE activity_event_outbox");
    expect(statements[0]?.query).toContain("SET status = 'sending'");
    expect(statements[0]?.query).toContain("RETURNING id, payload");
    expect(sendBatch).toHaveBeenCalledWith([{ body: activityMessage, contentType: "json" }]);
    expect(batch).toHaveBeenCalledTimes(1);
    const sentStatement = statements.find((statement) =>
      statement.query.includes("SET status = 'sent'"),
    );
    expect(sentStatement?.query).toContain("AND status = 'sending'");
  });

  it("releases claimed rows when queue send fails", async () => {
    const { db, batch, statements } = createDatabaseHarness();
    const sendBatch = vi.fn(() => Promise.reject(new Error("Queue unavailable")));
    const queue = {
      sendBatch,
    } as unknown as Queue<ActivityEventMessage>;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await new D1ActivityOutboxRepository(db).relayPending(queue);
    } finally {
      consoleError.mockRestore();
    }

    expect(batch).toHaveBeenCalledTimes(1);
    const failedStatement = statements.find((statement) =>
      statement.query.includes("SET status = 'pending'"),
    );
    expect(failedStatement?.query).toContain("attempts = attempts + 1");
    expect(failedStatement?.query).toContain("AND status = 'sending'");
  });
});
