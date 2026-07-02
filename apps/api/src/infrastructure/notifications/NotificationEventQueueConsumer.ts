import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { IngestMaintenanceReminderEvent } from "../../application/usecases/IngestMaintenanceReminderEvent.ts";
import type { IngestMaintenanceReminderEventCommand } from "../../application/usecases/IngestMaintenanceReminderEvent.ts";
import { SystemClock } from "../time/SystemClock.ts";
import { D1NotificationEventLog } from "../persistence/D1NotificationEventLog.ts";
import { D1NotificationDeadLetterRepository } from "../persistence/D1NotificationDeadLetterRepository.ts";
import { D1ScheduledReminderRepository } from "../persistence/D1ScheduledReminderRepository.ts";
import {
  NOTIFICATION_EVENTS_DLQ_NAME,
  isNotificationEventMessage,
  type NotificationEventMessage,
} from "./NotificationEventMessage.ts";

export async function handleNotificationEventBatch(
  batch: MessageBatch<unknown>,
  db: D1Database,
): Promise<void> {
  const deadLetters = new D1NotificationDeadLetterRepository(db);

  if (batch.queue === NOTIFICATION_EVENTS_DLQ_NAME) {
    for (const message of batch.messages) {
      await persistDeadLetter(message, batch.queue, deadLetters, "Queue retry limit exceeded");
    }
    return;
  }

  const useCase = new IngestMaintenanceReminderEvent(
    new D1ScheduledReminderRepository(db),
    new D1NotificationEventLog(db),
    new SystemClock(),
  );

  for (const message of batch.messages) {
    if (!isNotificationEventMessage(message.body)) {
      await persistDeadLetter(
        message,
        batch.queue,
        deadLetters,
        "Malformed notification event message",
      );
      continue;
    }

    try {
      await useCase.execute(toCommand(message.body));
      message.ack();
    } catch (error) {
      console.error({ error, messageId: message.id }, "Notification event message failed");
      message.retry();
    }
  }
}

function toCommand(message: NotificationEventMessage): IngestMaintenanceReminderEventCommand {
  const occurredAt = new Date(message.occurredAt);
  const taskId = MaintenanceTaskId.from(message.maintenanceTaskId);

  if (message.type === "MaintenanceTaskDeleted") {
    return { kind: "cancel", eventId: message.id, occurredAt, taskId };
  }

  return {
    kind: "schedule",
    eventId: message.id,
    occurredAt,
    ownerId: UserId.from(message.ownerId),
    actorId: message.actorId,
    taskId,
    assetId: AssetId.from(message.assetId),
    assetName: message.assetName,
    assetType: message.assetType,
    taskTitle: message.taskTitle,
    nextDue: message.nextDue,
  };
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
    console.error(
      { error, messageId: message.id, queue, attempts: message.attempts },
      "Notification dead-letter persistence failed",
    );
    message.retry();
  }
}
