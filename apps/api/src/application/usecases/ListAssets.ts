import {
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";

export type ListAssetsQuery = {
  ownerId: UserId;
};

export type AssetCategoryCounts = {
  all: number;
  vehicle: number;
  equipment: number;
  property: number;
};

export type AssetListReadModel = {
  assets: Asset[];
  counts: AssetCategoryCounts;
};

export class ListAssets {
  constructor(private readonly assets: AssetRepository) {}

  async execute(query: ListAssetsQuery): Promise<Result<AssetListReadModel, DomainError>> {
    try {
      const assets = (await this.assets.findByOwner(query.ownerId)).filter(
        (asset) => asset.archivedAt === null,
      );
      return ok({ assets, counts: buildAssetCategoryCounts(assets) });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}

function buildAssetCategoryCounts(assets: Asset[]): AssetCategoryCounts {
  return assets.reduce<AssetCategoryCounts>(
    (counts, asset) => {
      counts.all++;
      counts[asset.type]++;
      return counts;
    },
    { all: 0, vehicle: 0, equipment: 0, property: 0 },
  );
}
