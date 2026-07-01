import {
  ACTIVITY_HISTORY_CONSUMER,
  ACTIVITY_HISTORY_DLQ_NAME,
  isActivityEventMessage,
} from "./ActivityEventMessage.ts";
import { D1ActivityLogRepository } from "./D1ActivityLogRepository.ts";
import { D1ActivityOutboxRepository } from "./D1ActivityOutboxRepository.ts";
import { D1DeadLetterRepository } from "./D1DeadLetterRepository.ts";

const ACTIVITY_HISTORY_DLQ_MAX_RETRIES = 3;

export async function handleActivityQueueBatch(
  batch: MessageBatch<unknown>,
  db: D1Database,
): Promise<void> {
  const deadLetters = new D1DeadLetterRepository(db);

  if (batch.queue === ACTIVITY_HISTORY_DLQ_NAME) {
    await persistDeadLetterBatch(batch, deadLetters, "Queue retry limit exceeded");
    return;
  }

  const activityLog = new D1ActivityLogRepository(db);
  const outbox = new D1ActivityOutboxRepository(db);

  for (const message of batch.messages) {
    if (!isActivityEventMessage(message.body)) {
      await persistDeadLetterMessage(
        message,
        batch.queue,
        deadLetters,
        "Malformed activity event message",
      );
      continue;
    }

    try {
      const recordActivity = activityLog.prepareRecordEvent(message.body);
      const markDelivered = outbox.prepareMarkDelivered(message.body.id);
      await db.batch(recordActivity === null ? [markDelivered] : [recordActivity, markDelivered]);
      message.ack();
    } catch (error) {
      console.error({ error, messageId: message.id }, "Activity queue message failed");
      message.retry();
    }
  }
}

async function persistDeadLetterBatch(
  batch: MessageBatch<unknown>,
  deadLetters: D1DeadLetterRepository,
  reason: string,
): Promise<void> {
  for (const message of batch.messages) {
    await persistDeadLetterMessage(message, batch.queue, deadLetters, reason);
  }
}

async function persistDeadLetterMessage(
  message: Message<unknown>,
  queue: string,
  deadLetters: D1DeadLetterRepository,
  reason: string,
): Promise<void> {
  try {
    await deadLetters.save({
      consumer: ACTIVITY_HISTORY_CONSUMER,
      queue,
      queueMessageId: message.id,
      attempts: message.attempts,
      payload: message.body,
      reason,
    });
    message.ack();
  } catch (error) {
    const isTerminalDlqFailure =
      queue === ACTIVITY_HISTORY_DLQ_NAME && message.attempts >= ACTIVITY_HISTORY_DLQ_MAX_RETRIES;
    console.error(
      { error, messageId: message.id, queue, attempts: message.attempts },
      isTerminalDlqFailure
        ? "Activity terminal dead-letter persistence failed"
        : "Activity dead-letter persistence failed",
    );
    message.retry();
  }
}
