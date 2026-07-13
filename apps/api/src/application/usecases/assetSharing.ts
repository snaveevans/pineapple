import type { UserId } from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";

export type AssetSharingDescriptor = {
  scope: "personal" | "team";
  isOwner: boolean;
  ownerDisplayName?: string;
};

export function toSharingDescriptor(
  asset: Asset,
  requesterId: UserId,
  ownerDisplayName: string | null,
): AssetSharingDescriptor {
  const isOwner = asset.ownerId === requesterId;
  const scope = asset.sharedTeamId === null ? "personal" : "team";
  if (isOwner || ownerDisplayName === null) {
    return { scope, isOwner };
  }
  return { scope, isOwner, ownerDisplayName };
}
