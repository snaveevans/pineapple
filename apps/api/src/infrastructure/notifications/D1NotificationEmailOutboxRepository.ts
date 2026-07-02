import {
  type ReminderEmailMessage,
  isReminderEmailMessage,
} from "./ReminderEmailMessage.ts";

type OutboxRow = {
  id: string;
  payload: string;
};

const OUTBOX_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export class D1NotificationEmailOutboxRepository {
  constructor(private readonly db: D1Database) {}

  async relayPending(queue: Queue<ReminderEmailMessage>, limit = 25): Promise<void> {
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
      console.error({ error }, "Reminder email outbox relay failed");
      await this.recordRelayFailure(rows, error);
    }
  }

  prepareMarkDelivered(id: string): D1PreparedStatement {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `UPDATE notification_email_outbox
         SET delivered_at = COALESCE(delivered_at, ?),
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, now, id);
  }

  private async claimPending(limit: number): Promise<OutboxRow[]> {
    const now = new Date();
    const claimedAt = now.toISOString();
    const staleBefore = new Date(now.getTime() - OUTBOX_CLAIM_TIMEOUT_MS).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE notification_email_outbox
         SET status = 'sending', updated_at = ?
         WHERE id IN (
           SELECT id FROM notification_email_outbox
           WHERE status = 'pending' OR (status = 'sending' AND updated_at <= ?)
           ORDER BY created_at ASC, id ASC
           LIMIT ?
         )
         RETURNING id, payload`,
      )
      .bind(claimedAt, staleBefore, limit)
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
            `UPDATE notification_email_outbox
             SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ?, last_error = NULL
             WHERE id = ? AND status = 'sending'`,
          )
          .bind(now, now, id),
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
              `UPDATE notification_email_outbox
               SET status = 'pending', attempts = attempts + 1, updated_at = ?, last_error = ?
               WHERE id = ? AND status = 'sending'`,
            )
            .bind(now, message, row.id),
        ),
      );
    } catch (failureRecordError) {
      console.error({ error: failureRecordError }, "Reminder email outbox failure update failed");
    }
  }
}

function parseOutboxMessage(payload: string): ReminderEmailMessage {
  const parsed: unknown = JSON.parse(payload);
  if (!isReminderEmailMessage(parsed)) {
    throw new Error("Reminder email outbox payload is malformed");
  }
  return parsed;
}
