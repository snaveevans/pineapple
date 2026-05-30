import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../AssetType.ts";
import type { DomainEvent } from "../../events/DomainEvent";

export type AssetCreated = DomainEvent & {
  type: "AssetCreated";
  assetId: AssetId;
  ownerId: UserId;
  assetType: AssetType;
  assetModelYear?: number;
};

export const AssetCreated = (props: {
  assetId: AssetId;
  ownerId: UserId;
  assetType: AssetType;
  assetModelYear?: number;
}): AssetCreated => ({
  type: "AssetCreated",
  assetId: props.assetId,
  ownerId: props.ownerId,
  assetType: props.assetType,
  ...(props.assetModelYear !== undefined ? { assetModelYear: props.assetModelYear } : {}),
  occurredAt: new Date(),
});
