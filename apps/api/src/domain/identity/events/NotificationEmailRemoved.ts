import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type NotificationEmailRemoved = DomainEvent & {
  type: "NotificationEmailRemoved";
  userId: UserId;
};

export const NotificationEmailRemoved = (props: { userId: UserId }): NotificationEmailRemoved => ({
  ...createDomainEventMetadata(),
  type: "NotificationEmailRemoved",
  userId: props.userId,
});
