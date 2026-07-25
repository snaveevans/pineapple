import { EmailBatchId } from "@snaveevans/pineapple-shared";
import { DispatchReminderEmail } from "../../application/usecases/DispatchReminderEmail.ts";
import type { Clock } from "../../application/ports/Clock.ts";
import type { EventBus } from "../../application/ports/EventBus.ts";
import type { TransactionalEmailSender } from "../../application/ports/TransactionalEmailSender.ts";
import { D1EmailBatchRepository } from "../persistence/D1EmailBatchRepository.ts";
import { D1NotificationDeadLetterRepository } from "../persistence/D1NotificationDeadLetterRepository.ts";
import { D1NotificationRepository } from "../persistence/D1NotificationRepository.ts";
import { D1UserRepository } from "../persistence/D1UserRepository.ts";
import { D1NotificationEmailOutboxRepository } from "./D1NotificationEmailOutboxRepository.ts";
import {
  REMINDER_EMAIL_DLQ_NAME,
  isReminderEmailMessage,
  type ReminderEmailMessage,
} from "./ReminderEmailMessage.ts";

const REMINDER_EMAIL_DLQ_MAX_RETRIES = 3;

export type ReminderEmailConsumerDependencies = {
  db: D1Database;
  emailSender: TransactionalEmailSender;
  eventBus: EventBus;
  clock: Clock;
};

export async function handleReminderEmailQueueBatch(
  batch: MessageBatch<unknown>,
  deps: ReminderEmailConsumerDependencies,
): Promise<void> {
  const deadLetters = new D1NotificationDeadLetterRepository(deps.db);

  if (batch.queue === REMINDER_EMAIL_DLQ_NAME) {
    for (const message of batch.messages) {
      await persistDeadLetter(message, batch.queue, deadLetters, "Queue retry limit exceeded");
    }
    return;
  }

  const outbox = new D1NotificationEmailOutboxRepository(deps.db);

  for (const message of batch.messages) {
    if (!isReminderEmailMessage(message.body)) {
      await persistDeadLetter(
        message,
        batch.queue,
        deadLetters,
        "Malformed reminder email message",
      );
      continue;
    }

    try {
      const disposition = await processReminderEmailMessage(message.body, deps);
      if (disposition.action === "dead_letter") {
        // Terminal failure: record it durably now instead of burning retries on a
        // message that can never succeed (error-handling spec, durable-consumer flow).
        await persistDeadLetter(message, batch.queue, deadLetters, disposition.reason);
      } else if (disposition.action === "retry") {
        message.retry();
      } else {
        await outbox.prepareMarkDelivered(message.body.id).run();
        message.ack();
      }
    } catch (error) {
      // Fail-safe: an unexpected throw (e.g. a leaked infra error) is transient —
      // retry rather than silently ack or dead-letter on a guess.
      console.error(
        { error, messageId: message.id, queue: batch.queue },
        "Reminder email message failed",
      );
      message.retry();
    }
  }
}

/**
 * Maps a dispatch attempt to the queue action the caller must take. Retryability is
 * decided by the use case in its result — never inferred from an error subclass.
 */
export type ReminderEmailDisposition =
  | { action: "ack" }
  | { action: "retry" }
  | { action: "dead_letter"; reason: string };

export async function processReminderEmailMessage(
  message: ReminderEmailMessage,
  deps: ReminderEmailConsumerDependencies,
): Promise<ReminderEmailDisposition> {
  const result = await new DispatchReminderEmail(
    new D1EmailBatchRepository(deps.db),
    new D1NotificationRepository(deps.db),
    new D1UserRepository(deps.db),
    deps.emailSender,
    deps.eventBus,
    deps.clock,
  ).execute({ emailBatchId: EmailBatchId.from(message.batchId) });

  if (!result.ok) {
    // The use case surfaced an unexpected domain error instead of a classified
    // outcome. Treat it as transient and retry so it fails safe.
    console.error(
      { emailBatchId: message.batchId, error: result.error.message },
      "Reminder email dispatch returned an unexpected domain error",
    );
    return { action: "retry" };
  }

  const outcome = result.value;
  if (outcome.status === "terminal_failure") {
    return {
      action: "dead_letter",
      reason: outcome.terminalReason ?? "Reminder email dispatch failed permanently",
    };
  }
  if (outcome.retryable) {
    return { action: "retry" };
  }
  return { action: "ack" };
}

async function persistDeadLetter(
  message: Message<unknown>,
  queue: string,
  deadLetters: D1NotificationDeadLetterRepository,
  reason: string,
): Promise<void> {
  try {
    await deadLetters.save({
      id: crypto.randomUUID(),
      queue,
      payload: JSON.stringify(message.body),
      error: reason,
      receivedAt: new Date(),
    });
    message.ack();
  } catch (error) {
    const isTerminalDlqFailure =
      queue === REMINDER_EMAIL_DLQ_NAME && message.attempts >= REMINDER_EMAIL_DLQ_MAX_RETRIES;
    console.error(
      { error, messageId: message.id, queue, attempts: message.attempts },
      isTerminalDlqFailure
        ? "Reminder email terminal dead-letter persistence failed"
        : "Reminder email dead-letter persistence failed",
    );
    message.retry();
  }
}
