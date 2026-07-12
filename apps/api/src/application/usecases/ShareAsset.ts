import {
  type AssetId,
  ConflictError,
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
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type ShareAssetCommand = {
  assetId: AssetId;
  requesterId: UserId;
};

export class ShareAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: ShareAssetCommand): Promise<Result<Asset, DomainError>> {
    try {
      const asset = await this.assets.findById(cmd.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));

      if (asset.ownerId !== cmd.requesterId) {
        const visible = await canAccessAsset(asset, cmd.requesterId, this.teams);
        if (!visible) return err(new ForbiddenError("Access denied"));
        return err(new ForbiddenError("Only the asset owner can change sharing"));
      }

      const team = await this.teams.findByMember(cmd.requesterId);
      if (!team) return err(new ConflictError("User does not belong to a team"));

      asset.shareToTeam({
        teamId: team.id,
        teamName: team.name,
        actorId: cmd.requesterId,
      });
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
