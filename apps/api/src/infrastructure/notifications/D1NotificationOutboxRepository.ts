import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import {
  NOTIFICATION_EVENTS_CONSUMER,
  type NotificationEventMessage,
  isNotificationEventMessage,
  toNotificationEventMessage,
} from "./NotificationEventMessage.ts";

type OutboxRow = {
  id: string;
  payload: string;
};

const OUTBOX_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Prepares an outbox insert for a maintenance-task event, or null for any event
 * the notification consumer doesn't care about. Run in the same D1 batch as the
 * domain change so enqueue is durable.
 */
export function prepareNotificationOutboxInsert(
  db: D1Database,
  event: DomainEvent,
): D1PreparedStatement | null {
  const message = toNotificationEventMessage(event);
  if (message === null) return null;

  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT OR IGNORE INTO notification_event_outbox
         (id, consumer, event_type, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    )
    .bind(
      message.id,
      NOTIFICATION_EVENTS_CONSUMER,
      message.type,
      JSON.stringify(message),
      now,
      now,
    );
}

export class D1NotificationOutboxRepository {
  constructor(private readonly db: D1Database) {}

  async relayPending(queue: Queue<NotificationEventMessage>, limit = 25): Promise<void> {
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
      console.error({ error }, "Notification outbox relay failed");
      await this.recordRelayFailure(rows, error);
    }
  }

  private async claimPending(limit: number): Promise<OutboxRow[]> {
    const now = new Date();
    const claimedAt = now.toISOString();
    const staleBefore = new Date(now.getTime() - OUTBOX_CLAIM_TIMEOUT_MS).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE notification_event_outbox
         SET status = 'sending', updated_at = ?
         WHERE consumer = ?
           AND id IN (
             SELECT id FROM notification_event_outbox
             WHERE consumer = ?
               AND (status = 'pending' OR (status = 'sending' AND updated_at <= ?))
             ORDER BY created_at ASC, id ASC
             LIMIT ?
           )
         RETURNING id, payload`,
      )
      .bind(
        claimedAt,
        NOTIFICATION_EVENTS_CONSUMER,
        NOTIFICATION_EVENTS_CONSUMER,
        staleBefore,
        limit,
      )
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
            `UPDATE notification_event_outbox
             SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ?, last_error = NULL
             WHERE id = ? AND consumer = ? AND status = 'sending'`,
          )
          .bind(now, now, id, NOTIFICATION_EVENTS_CONSUMER),
      ),
    );
  }

  private async recordRelayFailure(rows: OutboxRow[], error: unknown): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown relay failure";
    try {
      await this.db.batch(
        rows.map((row) =>
          this.db
            .prepare(
              `UPDATE notification_event_outbox
               SET status = 'pending', attempts = attempts + 1, updated_at = ?, last_error = ?
               WHERE id = ? AND consumer = ? AND status = 'sending'`,
            )
            .bind(now, message, row.id, NOTIFICATION_EVENTS_CONSUMER),
        ),
      );
    } catch (failureRecordError) {
      console.error({ error: failureRecordError }, "Notification outbox failure update failed");
    }
  }
}

function parseOutboxMessage(payload: string): NotificationEventMessage {
  const parsed: unknown = JSON.parse(payload);
  if (!isNotificationEventMessage(parsed)) {
    throw new Error("Notification outbox payload is malformed");
  }
  return parsed;
}
