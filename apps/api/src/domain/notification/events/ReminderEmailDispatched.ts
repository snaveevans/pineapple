import type { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type ReminderEmailDispatchResult = "sent" | "suppressed" | "failed";
export type ReminderEmailSuppressReason = "no_contact_email" | "unverified" | "none";

export type ReminderEmailDispatched = DomainEvent & {
  type: "ReminderEmailDispatched";
  emailBatchId: EmailBatchId;
  ownerId: UserId;
  result: ReminderEmailDispatchResult;
  suppressReason: ReminderEmailSuppressReason;
  notificationCount: number;
};

export const ReminderEmailDispatched = (props: {
  emailBatchId: EmailBatchId;
  ownerId: UserId;
  result: ReminderEmailDispatchResult;
  suppressReason: ReminderEmailSuppressReason;
  notificationCount: number;
}): ReminderEmailDispatched => ({
  ...createDomainEventMetadata(),
  type: "ReminderEmailDispatched",
  emailBatchId: props.emailBatchId,
  ownerId: props.ownerId,
  result: props.result,
  suppressReason: props.suppressReason,
  notificationCount: props.notificationCount,
});
