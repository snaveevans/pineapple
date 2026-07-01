import {
  ACTIVITY_HISTORY_CONSUMER,
  ACTIVITY_HISTORY_DLQ_NAME,
  isActivityEventMessage,
} from "./ActivityEventMessage.ts";
import { D1ActivityLogRepository } from "./D1ActivityLogRepository.ts";
import { D1ActivityOutboxRepository } from "./D1ActivityOutboxRepository.ts";
import { D1DeadLetterRepository } from "./D1DeadLetterRepository.ts";

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
      await deadLetters.save({
        consumer: ACTIVITY_HISTORY_CONSUMER,
        queue: batch.queue,
        queueMessageId: message.id,
        attempts: message.attempts,
        payload: message.body,
        reason: "Malformed activity event message",
      });
      message.ack();
      continue;
    }

    try {
      await activityLog.recordEvent(message.body);
      await outbox.markDelivered(message.body.id);
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
    await deadLetters.save({
      consumer: ACTIVITY_HISTORY_CONSUMER,
      queue: batch.queue,
      queueMessageId: message.id,
      attempts: message.attempts,
      payload: message.body,
      reason,
    });
    message.ack();
  }
}
