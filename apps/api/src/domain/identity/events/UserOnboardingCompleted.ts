import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type UserOnboardingCompleted = DomainEvent & {
  type: "UserOnboardingCompleted";
  userId: UserId;
};

export const UserOnboardingCompleted = (props: { userId: UserId }): UserOnboardingCompleted => ({
  ...createDomainEventMetadata(),
  type: "UserOnboardingCompleted",
  userId: props.userId,
});
