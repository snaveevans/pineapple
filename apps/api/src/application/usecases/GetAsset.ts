import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  NotFoundError,
  ForbiddenError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { canAccessAsset } from "./assetAccess.ts";
import { toSharingDescriptor, type AssetSharingDescriptor } from "./assetSharing.ts";

export type GetAssetQuery = {
  assetId: AssetId;
  requesterId: UserId;
};

export type AssetReadModel = {
  asset: Asset;
  sharing: AssetSharingDescriptor;
};

export class GetAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(query: GetAssetQuery): Promise<Result<AssetReadModel, DomainError>> {
    try {
      const asset = await this.assets.findById(query.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (!(await canAccessAsset(asset, query.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }

      let ownerDisplayName: string | null = null;
      if (asset.ownerId !== query.requesterId) {
        const owners = await this.users.findByIds([asset.ownerId]);
        ownerDisplayName = owners[0]?.name ?? "Unknown";
      }

      return ok({
        asset,
        sharing: toSharingDescriptor(asset, query.requesterId, ownerDisplayName),
      });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
