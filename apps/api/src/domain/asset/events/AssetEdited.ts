import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type AssetEdited = DomainEvent & {
  type: "AssetEdited";
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  previousName: string;
  assetType: AssetType;
  nameChanged: boolean;
  metadataChanged: boolean;
};

export const AssetEdited = (props: {
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  previousName: string;
  assetType: AssetType;
  nameChanged: boolean;
  metadataChanged: boolean;
}): AssetEdited => ({
  ...createDomainEventMetadata(),
  type: "AssetEdited",
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  previousName: props.previousName,
  assetType: props.assetType,
  nameChanged: props.nameChanged,
  metadataChanged: props.metadataChanged,
});
