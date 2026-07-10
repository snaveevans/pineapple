import type { UserId } from "@snaveevans/pineapple-shared";

export type TeamRole = "owner" | "member";

export type Membership = {
  readonly userId: UserId;
  readonly role: TeamRole;
  readonly joinedAt: Date;
};

export function createMembership(props: {
  userId: UserId;
  role: TeamRole;
  joinedAt: Date;
}): Membership {
  return {
    userId: props.userId,
    role: props.role,
    joinedAt: props.joinedAt,
  };
}
