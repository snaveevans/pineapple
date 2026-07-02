import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { ReminderEmailMessage } from "./ReminderEmailMessage.ts";
import { D1NotificationEmailOutboxRepository } from "./D1NotificationEmailOutboxRepository.ts";

function message(): ReminderEmailMessage {
  const batchId = EmailBatchId.generate();
  return {
    id: batchId,
    type: "ReminderEmailRequested",
    schemaVersion: "v1",
    occurredAt: "2026-07-02T10:00:00.000Z",
    batchId,
    ownerId: UserId.generate(),
  };
}

describe("D1NotificationEmailOutboxRepository", () => {
  it("claims pending rows, sends them, and marks them sent", async () => {
    const outbound = message();
    const queries: string[] = [];
    const db = {
      prepare: (query: string) => {
        queries.push(query);
        return {
          bind: () => ({
            all: vi.fn().mockResolvedValue({
              results: [{ id: outbound.id, payload: JSON.stringify(outbound) }],
            }),
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          }),
        };
      },
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const queue = { sendBatch } as unknown as Queue<ReminderEmailMessage>;

    await new D1NotificationEmailOutboxRepository(db).relayPending(queue);

    expect(sendBatch).toHaveBeenCalledWith([{ body: outbound, contentType: "json" }]);
    expect(queries.some((q) => q.includes("UPDATE notification_email_outbox"))).toBe(true);
  });

  it("releases claimed rows when queue send fails", async () => {
    const outbound = message();
    const batchMock = vi.fn().mockResolvedValue([]);
    const db = {
      prepare: () => ({
        bind: () => ({
          all: vi.fn().mockResolvedValue({
            results: [{ id: outbound.id, payload: JSON.stringify(outbound) }],
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      }),
      batch: batchMock,
    } as unknown as D1Database;
    const queue = {
      sendBatch: vi.fn().mockRejectedValue(new Error("queue down")),
    } as unknown as Queue<ReminderEmailMessage>;

    await new D1NotificationEmailOutboxRepository(db).relayPending(queue);

    expect(batchMock).toHaveBeenCalled();
  });

  it("prepares a delivered marker for the queue consumer", () => {
    const statements: { query: string; values: unknown[] }[] = [];
    const db = {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => {
          statements.push({ query, values });
          return {} as D1PreparedStatement;
        },
      }),
    } as unknown as D1Database;

    new D1NotificationEmailOutboxRepository(db).prepareMarkDelivered("batch-1");

    expect(statements[0]?.query).toContain("delivered_at = COALESCE");
    expect(statements[0]?.values.at(-1)).toBe("batch-1");
  });
});
