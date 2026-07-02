import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type NotificationEmailUpdated = DomainEvent & {
  type: "NotificationEmailUpdated";
  userId: UserId;
};

export const NotificationEmailUpdated = (props: { userId: UserId }): NotificationEmailUpdated => ({
  ...createDomainEventMetadata(),
  type: "NotificationEmailUpdated",
  userId: props.userId,
});
