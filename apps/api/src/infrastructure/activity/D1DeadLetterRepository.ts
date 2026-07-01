import { isActivityEventMessage } from "./ActivityEventMessage.ts";

export type DeadLetterInput = {
  consumer: string;
  queue: string;
  queueMessageId: string;
  attempts: number;
  payload: unknown;
  reason: string;
};

export class D1DeadLetterRepository {
  constructor(private readonly db: D1Database) {}

  async save(input: DeadLetterInput): Promise<void> {
    const failedAt = new Date().toISOString();
    const activityEvent = isActivityEventMessage(input.payload) ? input.payload : null;

    await this.db
      .prepare(
        `INSERT OR IGNORE INTO dead_letters
           (id, consumer, queue, queue_message_id, source_event_id, event_type,
            payload, reason, attempts, failed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.consumer,
        input.queue,
        input.queueMessageId,
        activityEvent?.id ?? null,
        activityEvent?.type ?? null,
        serializePayload(input.payload),
        input.reason,
        input.attempts,
        failedAt,
      )
      .run();
  }
}

function serializePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}
