export interface NotificationDeadLetterRecord {
  id: string;
  queue: string;
  payload: string;
  error: string | null;
  receivedAt: Date;
}

/**
 * Port: durable sink for messages exhausted on the notification queues / DLQs, so
 * a permanently failing reminder or email job is persisted rather than dropped.
 */
export interface NotificationDeadLetterRepository {
  save(record: NotificationDeadLetterRecord): Promise<void>;
}
