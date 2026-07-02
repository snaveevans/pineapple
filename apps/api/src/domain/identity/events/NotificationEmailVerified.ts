import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type NotificationEmailVerified = DomainEvent & {
  type: "NotificationEmailVerified";
  userId: UserId;
};

export const NotificationEmailVerified = (props: {
  userId: UserId;
}): NotificationEmailVerified => ({
  ...createDomainEventMetadata(),
  type: "NotificationEmailVerified",
  userId: props.userId,
});
