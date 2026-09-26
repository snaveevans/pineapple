import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  NotFoundError,
  type Result,
  type UserId,
  err,
} from "@snaveevans/pineapple-shared";
import type { AgentAssetMetadataPatch } from "../ports/AgentOperationExecutor.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { Asset } from "../../domain/asset/Asset.ts";
import { EditAsset } from "./EditAsset.ts";
import { mergeAgentAssetMetadataPatch } from "./PatchAgentAssetMetadata.ts";

export type PatchAgentAssetCommand = {
  assetId: AssetId;
  requesterId: UserId;
  expectedRevision: number;
  name?: string;
  metadata?: AgentAssetMetadataPatch;
};

/** Applies a bounded partial edit through the existing owner-only EditAsset use case. */
export class PatchAgentAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly editAsset: EditAsset,
  ) {}

  async execute(command: PatchAgentAssetCommand): Promise<Result<Asset, DomainError>> {
    try {
      const current = await this.assets.findById(command.assetId);
      if (!current) return err(new NotFoundError("Asset not found"));

      const metadata =
        command.metadata === undefined
          ? current.metadata
          : mergeAgentAssetMetadataPatch(current.metadata, command.metadata);

      return await this.editAsset.execute({
        assetId: command.assetId,
        requesterId: command.requesterId,
        expectedRevision: command.expectedRevision,
        name: command.name ?? current.name,
        metadata,
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
