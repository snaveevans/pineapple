import { EmailBatchId } from "@snaveevans/pineapple-shared";
import { DispatchReminderEmail } from "../../application/usecases/DispatchReminderEmail.ts";
import type { Clock } from "../../application/ports/Clock.ts";
import type { EventBus } from "../../application/ports/EventBus.ts";
import type { TransactionalEmailSender } from "../../application/ports/TransactionalEmailSender.ts";
import { D1EmailBatchRepository } from "../persistence/D1EmailBatchRepository.ts";
import { D1NotificationRepository } from "../persistence/D1NotificationRepository.ts";
import { D1UserRepository } from "../persistence/D1UserRepository.ts";
import type { ReminderEmailMessage } from "./ReminderEmailMessage.ts";

export type ReminderEmailConsumerDependencies = {
  db: D1Database;
  emailSender: TransactionalEmailSender;
  eventBus: EventBus;
  clock: Clock;
};

export async function processReminderEmailMessage(
  message: ReminderEmailMessage,
  deps: ReminderEmailConsumerDependencies,
): Promise<void> {
  const result = await new DispatchReminderEmail(
    new D1EmailBatchRepository(deps.db),
    new D1NotificationRepository(deps.db),
    new D1UserRepository(deps.db),
    deps.emailSender,
    deps.eventBus,
    deps.clock,
  ).execute({ emailBatchId: EmailBatchId.from(message.batchId) });

  if (!result.ok) {
    console.error(
      { emailBatchId: message.batchId, error: result.error.message },
      "Reminder email batch could not be dispatched",
    );
    return;
  }

  if (result.value.retryable) {
    throw new Error(`Reminder email batch ${message.batchId} failed with retryable error`);
  }
}
