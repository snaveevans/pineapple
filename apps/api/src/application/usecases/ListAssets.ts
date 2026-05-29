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

export class ListAssets {
  constructor(private readonly assets: AssetRepository) {}

  async execute(query: ListAssetsQuery): Promise<Result<Asset[], DomainError>> {
    try {
      const assets = await this.assets.findByOwner(query.ownerId);
      return ok(assets.filter((a) => a.archivedAt === null));
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
