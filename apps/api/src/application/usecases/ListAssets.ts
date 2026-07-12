import {
  createAssetCategoryCounts,
  type AssetCategoryCounts,
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { toSharingDescriptor, type AssetSharingDescriptor } from "./assetSharing.ts";

export type ListAssetsQuery = {
  requesterId: UserId;
};

export type ListedAsset = {
  asset: Asset;
  sharing: AssetSharingDescriptor;
};

export type AssetListReadModel = {
  assets: ListedAsset[];
  counts: AssetCategoryCounts;
};

export class ListAssets {
  constructor(
    private readonly assets: AssetRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(query: ListAssetsQuery): Promise<Result<AssetListReadModel, DomainError>> {
    try {
      const assets = (await this.assets.findVisibleTo(query.requesterId)).filter(
        (asset) => asset.archivedAt === null,
      );

      const otherOwnerIds = [
        ...new Set(
          assets
            .filter((asset) => asset.ownerId !== query.requesterId)
            .map((asset) => asset.ownerId),
        ),
      ];
      const owners = otherOwnerIds.length > 0 ? await this.users.findByIds(otherOwnerIds) : [];
      const ownerNames = new Map(owners.map((user) => [user.id, user.name ?? "Unknown"]));

      const listed: ListedAsset[] = assets.map((asset) => ({
        asset,
        sharing: toSharingDescriptor(
          asset,
          query.requesterId,
          asset.ownerId === query.requesterId ? null : (ownerNames.get(asset.ownerId) ?? "Unknown"),
        ),
      }));

      return ok({
        assets: listed,
        counts: buildAssetCategoryCounts(assets),
      });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}

function buildAssetCategoryCounts(assets: Asset[]): AssetCategoryCounts {
  const counts = createAssetCategoryCounts();
  for (const asset of assets) {
    counts.all++;
    counts[asset.type]++;
  }
  return counts;
}
