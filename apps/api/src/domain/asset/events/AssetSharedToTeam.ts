import type { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type AssetSharedToTeam = DomainEvent & {
  type: "AssetSharedToTeam";
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  teamId: TeamId;
  teamName: string;
};

export const AssetSharedToTeam = (props: {
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  teamId: TeamId;
  teamName: string;
}): AssetSharedToTeam => ({
  ...createDomainEventMetadata(),
  type: "AssetSharedToTeam",
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  teamId: props.teamId,
  teamName: props.teamName,
});
