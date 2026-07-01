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

const OUTBOX_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

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
    let rows: OutboxRow[] = [];

    try {
      rows = await this.claimPending(limit);
      if (rows.length === 0) return;

      const messages = rows.map((row) => ({
        body: parseOutboxMessage(row.payload),
        contentType: "json" as const,
      }));
      await queue.sendBatch(messages);
      await this.markSent(rows.map((row) => row.id));
    } catch (error) {
      console.error({ error }, "Activity outbox relay failed");
      await this.recordRelayFailure(rows, error);
    }
  }

  async markDelivered(eventId: string): Promise<void> {
    await this.prepareMarkDelivered(eventId).run();
  }

  prepareMarkDelivered(eventId: string): D1PreparedStatement {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `UPDATE activity_event_outbox
         SET delivered_at = COALESCE(delivered_at, ?),
             updated_at = ?
         WHERE id = ? AND consumer = ?`,
      )
      .bind(now, now, eventId, ACTIVITY_HISTORY_CONSUMER);
  }

  private async claimPending(limit: number): Promise<OutboxRow[]> {
    const now = new Date();
    const claimedAt = now.toISOString();
    const staleBefore = new Date(now.getTime() - OUTBOX_CLAIM_TIMEOUT_MS).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE activity_event_outbox
         SET status = 'sending',
             updated_at = ?
         WHERE consumer = ?
           AND id IN (
             SELECT id
             FROM activity_event_outbox
             WHERE consumer = ?
               AND (
                 status = 'pending'
                 OR (status = 'sending' AND updated_at <= ?)
               )
             ORDER BY created_at ASC, id ASC
             LIMIT ?
           )
         RETURNING id, payload`,
      )
      .bind(claimedAt, ACTIVITY_HISTORY_CONSUMER, ACTIVITY_HISTORY_CONSUMER, staleBefore, limit)
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
                 sent_at = COALESCE(sent_at, ?),
                 updated_at = ?,
                 last_error = NULL
             WHERE id = ? AND consumer = ? AND status = 'sending'`,
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
             SET status = 'pending',
                 attempts = attempts + 1,
                 updated_at = ?,
                 last_error = ?
             WHERE id = ? AND consumer = ? AND status = 'sending'`,
          )
          .bind(now, message, id, ACTIVITY_HISTORY_CONSUMER),
      ),
    );
  }

  private async recordRelayFailure(rows: OutboxRow[], error: unknown): Promise<void> {
    try {
      await this.markRelayFailed(
        rows.map((row) => row.id),
        error instanceof Error ? error.message : "Unknown relay failure",
      );
    } catch (failureRecordError) {
      console.error({ error: failureRecordError }, "Activity outbox failure update failed");
    }
  }
}

function parseOutboxMessage(payload: string): ActivityEventMessage {
  const parsed: unknown = JSON.parse(payload);
  if (!isActivityEventMessage(parsed)) {
    throw new Error("Activity outbox payload is malformed");
  }
  return parsed;
}
