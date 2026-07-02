import {
  type DomainError,
  DomainError as DomainErrorClass,
  type EmailBatchId,
  err,
  NotFoundError,
  ok,
  type Result,
} from "@snaveevans/pineapple-shared";
import { ReminderEmailDispatched } from "../../domain/notification/events/ReminderEmailDispatched.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EmailBatchRepository } from "../ports/EmailBatchRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { NotificationRecord, NotificationRepository } from "../ports/NotificationRepository.ts";
import type { TransactionalEmailSender } from "../ports/TransactionalEmailSender.ts";

export type DispatchReminderEmailCommand = {
  emailBatchId: EmailBatchId;
};

export type DispatchReminderEmailResult = {
  status: "sent" | "suppressed" | "failed" | "already_processed" | "retryable_failure";
  retryable: boolean;
};

export class DispatchReminderEmail {
  constructor(
    private readonly batches: EmailBatchRepository,
    private readonly notifications: NotificationRepository,
    private readonly users: UserRepository,
    private readonly emailSender: TransactionalEmailSender,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(
    cmd: DispatchReminderEmailCommand,
  ): Promise<Result<DispatchReminderEmailResult, DomainError>> {
    try {
      const batch = await this.batches.findById(cmd.emailBatchId);
      if (!batch) return err(new NotFoundError("Email batch not found"));
      if (batch.status !== "pending") {
        return ok({ status: "already_processed", retryable: false });
      }

      const user = await this.users.findById(batch.ownerId);
      if (!user) return err(new NotFoundError("User not found"));

      if (user.notificationEmail === null) {
        await this.recordOutcome(cmd.emailBatchId, batch.ownerId, "suppressed", "no_contact_email", batch.notificationCount);
        return ok({ status: "suppressed", retryable: false });
      }

      if (user.notificationEmailVerifiedAt === null) {
        await this.recordOutcome(cmd.emailBatchId, batch.ownerId, "suppressed", "unverified", batch.notificationCount);
        return ok({ status: "suppressed", retryable: false });
      }

      const batchNotifications = await this.notifications.listByEmailBatch(
        cmd.emailBatchId,
        batch.ownerId,
      );
      const sendResult = await this.emailSender.send({
        to: { address: user.notificationEmail, ...(user.name ? { name: user.name } : {}) },
        subject: "Upcoming maintenance reminders",
        text: renderReminderEmailText(batchNotifications),
      });

      if (sendResult.status === "sent") {
        await this.recordOutcome(cmd.emailBatchId, batch.ownerId, "sent", "none", batch.notificationCount);
        return ok({ status: "sent", retryable: false });
      }

      if (sendResult.retryable) {
        console.error(
          { emailBatchId: cmd.emailBatchId, reason: sendResult.reason },
          "reminder email send failed with retryable error",
        );
        return ok({ status: "retryable_failure", retryable: true });
      }

      await this.recordOutcome(cmd.emailBatchId, batch.ownerId, "failed", "none", batch.notificationCount);
      return ok({ status: "failed", retryable: false });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }

  private async recordOutcome(
    emailBatchId: EmailBatchId,
    ownerId: ReminderEmailDispatched["ownerId"],
    result: "sent" | "suppressed" | "failed",
    suppressReason: ReminderEmailDispatched["suppressReason"],
    notificationCount: number,
  ): Promise<void> {
    await this.batches.updateOutcome(emailBatchId, result, suppressReason, this.clock.now());
    await this.eventBus.publish(
      ReminderEmailDispatched({
        emailBatchId,
        ownerId,
        result,
        suppressReason,
        notificationCount,
      }),
    );
  }
}

function renderReminderEmailText(notifications: NotificationRecord[]): string {
  const lines = [
    "You have upcoming maintenance due soon:",
    "",
    ...notifications.map(
      (notification) =>
        `- ${notification.assetName}: ${notification.taskTitle}, due ${notification.nextDue}`,
    ),
    "",
    "Open Pineapple to review your maintenance queue.",
  ];
  return lines.join("\n");
}
