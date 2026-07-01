import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import {
  ACTIVITY_HISTORY_CONSUMER,
  type ActivityEventMessage,
  isActivityEventMessage,
  toActivityEventMessage,
} from "./ActivityEventMessage.ts";

type OutboxRow = {
  id: string;
  payload: string;
};

export function prepareActivityOutboxInsert(
  db: D1Database,
  event: DomainEvent,
): D1PreparedStatement | null {
  const message = toActivityEventMessage(event);
  if (message === null) return null;

  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT OR IGNORE INTO activity_event_outbox
         (id, consumer, event_type, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    )
    .bind(message.id, ACTIVITY_HISTORY_CONSUMER, message.type, JSON.stringify(message), now, now);
}

export class D1ActivityOutboxRepository {
  constructor(private readonly db: D1Database) {}

  async relayPending(queue: Queue<ActivityEventMessage>, limit = 25): Promise<void> {
    const rows = await this.pendingRows(limit);
    if (rows.length === 0) return;

    const messages = rows.map((row) => ({
      body: parseOutboxMessage(row.payload),
      contentType: "json" as const,
    }));

    try {
      await queue.sendBatch(messages);
      await this.markSent(rows.map((row) => row.id));
    } catch (error) {
      console.error({ error }, "Activity outbox relay failed");
      await this.markRelayFailed(
        rows.map((row) => row.id),
        error instanceof Error ? error.message : "Unknown relay failure",
      );
    }
  }

  async markDelivered(eventId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE activity_event_outbox
         SET delivered_at = COALESCE(delivered_at, ?),
             updated_at = ?
         WHERE id = ? AND consumer = ?`,
      )
      .bind(now, now, eventId, ACTIVITY_HISTORY_CONSUMER)
      .run();
  }

  private async pendingRows(limit: number): Promise<OutboxRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, payload
         FROM activity_event_outbox
         WHERE consumer = ? AND status = 'pending'
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      )
      .bind(ACTIVITY_HISTORY_CONSUMER, limit)
      .all<OutboxRow>();
    return result.results;
  }

  private async markSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    await this.db.batch(
      ids.map((id) =>
        this.db
          .prepare(
            `UPDATE activity_event_outbox
             SET status = 'sent',
                 attempts = attempts + 1,
                 sent_at = COALESCE(sent_at, ?),
                 updated_at = ?,
                 last_error = NULL
             WHERE id = ? AND consumer = ?`,
          )
          .bind(now, now, id, ACTIVITY_HISTORY_CONSUMER),
      ),
    );
  }

  private async markRelayFailed(ids: string[], message: string): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    await this.db.batch(
      ids.map((id) =>
        this.db
          .prepare(
            `UPDATE activity_event_outbox
             SET attempts = attempts + 1,
                 updated_at = ?,
                 last_error = ?
             WHERE id = ? AND consumer = ?`,
          )
          .bind(now, message, id, ACTIVITY_HISTORY_CONSUMER),
      ),
    );
  }
}

function parseOutboxMessage(payload: string): ActivityEventMessage {
  const parsed: unknown = JSON.parse(payload);
  if (!isActivityEventMessage(parsed)) {
    throw new Error("Activity outbox payload is malformed");
  }
  return parsed;
}
