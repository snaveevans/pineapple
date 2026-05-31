import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  NotFoundError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";

export type GetAssetQuery = {
  assetId: AssetId;
  requesterId: UserId;
};

export class GetAsset {
  constructor(private readonly assets: AssetRepository) {}

  async execute(query: GetAssetQuery): Promise<Result<Asset, DomainError>> {
    try {
      const asset = await this.assets.findById(query.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (asset.ownerId !== query.requesterId) return err(new NotFoundError("Asset not found"));
      return ok(asset);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
