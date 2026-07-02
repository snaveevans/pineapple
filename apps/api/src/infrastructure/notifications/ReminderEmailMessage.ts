export const REMINDER_EMAIL_CONSUMER = "reminder_email";
export const REMINDER_EMAIL_QUEUE_NAME = "pineapple-reminder-email";
export const REMINDER_EMAIL_DLQ_NAME = "pineapple-reminder-email-dlq";

export type ReminderEmailMessage = {
  id: string;
  type: "ReminderEmailRequested";
  schemaVersion: "v1";
  occurredAt: string;
  batchId: string;
  ownerId: string;
};

export function createReminderEmailMessage(input: {
  batchId: string;
  ownerId: string;
  occurredAt: Date;
}): ReminderEmailMessage {
  return {
    id: input.batchId,
    type: "ReminderEmailRequested",
    schemaVersion: "v1",
    occurredAt: input.occurredAt.toISOString(),
    batchId: input.batchId,
    ownerId: input.ownerId,
  };
}

export function isReminderEmailMessage(value: unknown): value is ReminderEmailMessage {
  if (!isRecord(value)) return false;
  return (
    value.id === value.batchId &&
    value.type === "ReminderEmailRequested" &&
    value.schemaVersion === "v1" &&
    isString(value.occurredAt) &&
    isString(value.batchId) &&
    isString(value.ownerId)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
