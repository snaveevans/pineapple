import type { UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent.ts";

export type UserNameUpdated = DomainEvent & {
  type: "UserNameUpdated";
  userId: UserId;
};

export const UserNameUpdated = (props: { userId: UserId }): UserNameUpdated => ({
  type: "UserNameUpdated",
  userId: props.userId,
  occurredAt: new Date(),
});
