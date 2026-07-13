import type { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type AssetUnsharedFromTeam = DomainEvent & {
  type: "AssetUnsharedFromTeam";
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  teamId: TeamId;
  teamName: string;
};

export const AssetUnsharedFromTeam = (props: {
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  teamId: TeamId;
  teamName: string;
}): AssetUnsharedFromTeam => ({
  ...createDomainEventMetadata(),
  type: "AssetUnsharedFromTeam",
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  teamId: props.teamId,
  teamName: props.teamName,
});
