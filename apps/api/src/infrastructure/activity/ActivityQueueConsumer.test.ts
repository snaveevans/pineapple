import { describe, expect, it, vi } from "vitest";
import { handleActivityQueueBatch } from "./ActivityQueueConsumer.ts";

function malformedMessage(id: string) {
  return {
    id,
    attempts: 1,
    body: { type: "NotAnActivityEvent" },
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

describe("handleActivityQueueBatch", () => {
  it("isolates dead-letter persistence failures per malformed message", async () => {
    let writes = 0;
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn(() => {
            writes += 1;
            if (writes === 1) throw new Error("D1 unavailable");
            return Promise.resolve({ success: true });
          }),
        })),
      })),
    } as unknown as D1Database;
    const first = malformedMessage("message-1");
    const second = malformedMessage("message-2");
    const batch = {
      queue: "pineapple-activity-history",
      messages: [first, second],
    } as unknown as MessageBatch<unknown>;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await handleActivityQueueBatch(batch, db);
    } finally {
      consoleError.mockRestore();
    }

    expect(first.retry).toHaveBeenCalledTimes(1);
    expect(first.ack).not.toHaveBeenCalled();
    expect(second.ack).toHaveBeenCalledTimes(1);
    expect(second.retry).not.toHaveBeenCalled();
  });
});
