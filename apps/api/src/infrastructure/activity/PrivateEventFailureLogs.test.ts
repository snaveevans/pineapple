import { describe, expect, it, vi } from "vitest";
import { handleActivityQueueBatch } from "./ActivityQueueConsumer.ts";
import { ACTIVITY_HISTORY_DLQ_NAME } from "./ActivityEventMessage.ts";
import { handleNotificationEventBatch } from "../notifications/NotificationEventQueueConsumer.ts";
import { NOTIFICATION_EVENTS_DLQ_NAME } from "../notifications/NotificationEventMessage.ts";
import { handleReminderEmailQueueBatch } from "../notifications/ReminderEmailQueueConsumer.ts";
import { REMINDER_EMAIL_DLQ_NAME } from "../notifications/ReminderEmailMessage.ts";
import { InMemoryEventBus } from "../events/InMemoryEventBus.ts";

const cases = [
  { queue: ACTIVITY_HISTORY_DLQ_NAME, handle: handleActivityQueueBatch },
  { queue: NOTIFICATION_EVENTS_DLQ_NAME, handle: handleNotificationEventBatch },
  {
    queue: REMINDER_EMAIL_DLQ_NAME,
    handle: (batch: MessageBatch<unknown>, db: D1Database) =>
      handleReminderEmailQueueBatch(batch, {
        db,
        emailSender: { send: () => Promise.resolve({ status: "sent" }) },
        eventBus: new InMemoryEventBus(),
        clock: { now: () => new Date("2026-09-25T00:00:00Z") },
      }),
  },
];

describe("Private event failure logs", () => {
  it.each(cases)(
    "retains retry behavior without logging dead-letter payload errors ($queue)",
    async ({ queue, handle }) => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const failure = new Error("867 Secret Lane private event rejected");
      const db = {
        prepare: () => ({ bind: () => ({ run: vi.fn().mockRejectedValue(failure) }) }),
      } as unknown as D1Database;
      const message = {
        id: "safe-message-id",
        body: { privateAddress: "867 Secret Lane" },
        attempts: 3,
        ack: vi.fn(),
        retry: vi.fn(),
      };
      try {
        await handle({ queue, messages: [message] } as unknown as MessageBatch<unknown>, db);
        expect(message.ack).not.toHaveBeenCalled();
        expect(message.retry).toHaveBeenCalledOnce();
        expect(errorLog).toHaveBeenCalledOnce();
        const fields = errorLog.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(fields).not.toHaveProperty("error");
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain("867 Secret Lane");
      } finally {
        errorLog.mockRestore();
      }
    },
  );
});
