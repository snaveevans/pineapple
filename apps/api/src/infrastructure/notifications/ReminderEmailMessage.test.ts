import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { createReminderEmailMessage, isReminderEmailMessage } from "./ReminderEmailMessage.ts";

describe("ReminderEmailMessage", () => {
  it("creates and validates an outbound reminder email job", () => {
    const batchId = EmailBatchId.generate();
    const ownerId = UserId.generate();
    const message = createReminderEmailMessage({
      batchId,
      ownerId,
      occurredAt: new Date("2026-07-02T10:30:00.000Z"),
    });

    expect(message).toEqual({
      id: batchId,
      type: "ReminderEmailRequested",
      schemaVersion: "v1",
      occurredAt: "2026-07-02T10:30:00.000Z",
      batchId,
      ownerId,
    });
    expect(isReminderEmailMessage(message)).toBe(true);
    expect(isReminderEmailMessage({ ...message, id: "different" })).toBe(false);
  });
});
