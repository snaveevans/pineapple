import type { TeamId, UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type TeamCreated = DomainEvent & {
  type: "TeamCreated";
  teamId: TeamId;
  ownerId: UserId;
  actorId: UserId;
  teamName: string;
};

export const TeamCreated = (props: {
  teamId: TeamId;
  ownerId: UserId;
  actorId: UserId;
  teamName: string;
}): TeamCreated => ({
  ...createDomainEventMetadata(),
  type: "TeamCreated",
  teamId: props.teamId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  teamName: props.teamName,
});
