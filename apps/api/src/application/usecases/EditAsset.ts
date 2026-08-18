import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  NotFoundError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type EditAssetCommand = {
  assetId: AssetId;
  requesterId: UserId;
  name: string;
  metadata: AssetMetadata;
};

export class EditAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: EditAssetCommand): Promise<Result<Asset, DomainError>> {
    try {
      const asset = await this.assets.findById(cmd.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));

      if (asset.ownerId !== cmd.requesterId) {
        const visible = await canAccessAsset(asset, cmd.requesterId, this.teams);
        if (!visible) return err(new ForbiddenError("Access denied"));
        return err(new ForbiddenError("Only the asset owner can edit this asset"));
      }

      asset.edit({ name: cmd.name, metadata: cmd.metadata, actorId: cmd.requesterId });
      const events = asset.pullEvents();
      await this.assets.save(asset, events);
      if (events.length > 0) {
        await this.eventBus.publishAll(events);
      }
      return ok(asset);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
