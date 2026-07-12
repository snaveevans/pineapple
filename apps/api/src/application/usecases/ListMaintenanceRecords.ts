import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  NotFoundError,
  type Result,
  type UserId,
  err,
  ok,
} from "@snaveevans/pineapple-shared";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type ListMaintenanceRecordsQuery = {
  assetId: AssetId;
  requesterId: UserId;
};

export class ListMaintenanceRecords {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly records: MaintenanceRecordRepository,
  ) {}

  async execute(
    query: ListMaintenanceRecordsQuery,
  ): Promise<Result<MaintenanceRecord[], DomainError>> {
    try {
      const asset = await this.assets.findById(query.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (!(await canAccessAsset(asset, query.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }

      // Access follows the asset; records are stored under the asset owner.
      const records = await this.records.findByAsset(asset.id, asset.ownerId);
      return ok(records);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
