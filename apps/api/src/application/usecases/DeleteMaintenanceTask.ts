import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  type MaintenanceTaskId,
  NotFoundError,
  type Result,
  type UserId,
  err,
  ok,
} from "@snaveevans/pineapple-shared";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type DeleteMaintenanceTaskCommand = {
  taskId: MaintenanceTaskId;
  assetId: AssetId;
  requesterId: UserId;
};

export class DeleteMaintenanceTask {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteMaintenanceTaskCommand): Promise<Result<void, DomainError>> {
    try {
      const task = await this.tasks.findById(command.taskId);
      if (!task) return err(new NotFoundError("Maintenance task not found"));
      if (task.assetId !== command.assetId) {
        return err(new NotFoundError("Maintenance task not found"));
      }

      const asset = await this.assets.findById(task.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (!(await canAccessAsset(asset, command.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }

      task.remove(command.requesterId, { assetName: asset.name, assetType: asset.type });
      const events = task.pullEvents();
      await this.tasks.delete(task.id, events);
      await this.eventBus.publishAll(events);
      return ok(undefined);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
