import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type UserProvisioned = DomainEvent & {
  type: "UserProvisioned";
  userId: UserId;
};

export const UserProvisioned = (props: { userId: UserId }): UserProvisioned => ({
  ...createDomainEventMetadata(),
  type: "UserProvisioned",
  userId: props.userId,
});
