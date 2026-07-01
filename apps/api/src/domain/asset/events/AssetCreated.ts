import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type AssetCreated = DomainEvent & {
  type: "AssetCreated";
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  assetModelYear?: number;
};

export const AssetCreated = (props: {
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  assetModelYear?: number;
}): AssetCreated => ({
  ...createDomainEventMetadata(),
  type: "AssetCreated",
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  ...(props.assetModelYear !== undefined ? { assetModelYear: props.assetModelYear } : {}),
});
