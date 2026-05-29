import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";

export type CreateAssetCommand = {
  ownerId: UserId;
  name: string;
  metadata: AssetMetadata;
};

export class CreateAsset {
  constructor(private readonly assets: AssetRepository) {}

  async execute(cmd: CreateAssetCommand): Promise<Result<AssetId, DomainError>> {
    try {
      const asset = Asset.create({
        ownerId: cmd.ownerId,
        name: cmd.name,
        metadata: cmd.metadata,
      });
      await this.assets.save(asset);
      asset.pullEvents(); // drain — no EventBus consumer yet
      return ok(asset.id);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
