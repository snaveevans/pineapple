import type { TeamId, UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type TeamCreated = DomainEvent & {
  type: "TeamCreated";
  teamId: TeamId;
  ownerId: UserId;
  actorId: UserId;
  name: string;
};

export const TeamCreated = (props: {
  teamId: TeamId;
  ownerId: UserId;
  actorId: UserId;
  name: string;
}): TeamCreated => ({
  ...createDomainEventMetadata(),
  type: "TeamCreated",
  teamId: props.teamId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  name: props.name,
});
