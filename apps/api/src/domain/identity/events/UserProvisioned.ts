import type { UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent.ts";

export type UserProvisioned = DomainEvent & {
  type: "UserProvisioned";
  userId: UserId;
};

export const UserProvisioned = (props: { userId: UserId }): UserProvisioned => ({
  type: "UserProvisioned",
  userId: props.userId,
  occurredAt: new Date(),
});
