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
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type ListMaintenanceTasksQuery = {
  assetId: AssetId;
  requesterId: UserId;
};

export class ListMaintenanceTasks {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly tasks: MaintenanceTaskRepository,
  ) {}

  async execute(query: ListMaintenanceTasksQuery): Promise<Result<MaintenanceTask[], DomainError>> {
    try {
      const asset = await this.assets.findById(query.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (!(await canAccessAsset(asset, query.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }

      const tasks = await this.tasks.findByAsset(asset.id);
      return ok(tasks);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
