import type {
  NotificationDeadLetterRecord,
  NotificationDeadLetterRepository,
} from "../../application/ports/NotificationDeadLetterRepository.ts";

export class D1NotificationDeadLetterRepository implements NotificationDeadLetterRepository {
  constructor(private readonly db: D1Database) {}

  async save(record: NotificationDeadLetterRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO notification_dead_letters (id, queue, payload, error, received_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(record.id, record.queue, record.payload, record.error, record.receivedAt.toISOString())
      .run();
  }
}
