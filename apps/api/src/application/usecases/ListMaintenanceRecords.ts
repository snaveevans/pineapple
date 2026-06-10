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

export type ListMaintenanceRecordsQuery = {
  assetId: AssetId;
  requesterId: UserId;
};

export class ListMaintenanceRecords {
  constructor(
    private readonly assets: AssetRepository,
    private readonly records: MaintenanceRecordRepository,
  ) {}

  async execute(
    query: ListMaintenanceRecordsQuery,
  ): Promise<Result<MaintenanceRecord[], DomainError>> {
    try {
      const asset = await this.assets.findById(query.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (asset.ownerId !== query.requesterId) {
        return err(new ForbiddenError("Access denied"));
      }

      const records = await this.records.findByAsset(asset.id, query.requesterId);
      return ok(records);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
