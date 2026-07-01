import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type UserNameUpdated = DomainEvent & {
  type: "UserNameUpdated";
  userId: UserId;
};

export const UserNameUpdated = (props: { userId: UserId }): UserNameUpdated => ({
  ...createDomainEventMetadata(),
  type: "UserNameUpdated",
  userId: props.userId,
});
