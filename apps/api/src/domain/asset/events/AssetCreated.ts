import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent";

export type AssetCreated = DomainEvent & {
  type: "AssetCreated";
  assetId: AssetId;
  ownerId: UserId;
};

export const AssetCreated = (assetId: AssetId, ownerId: UserId): AssetCreated => ({
  type: "AssetCreated",
  assetId,
  ownerId,
  occurredAt: new Date(),
});
