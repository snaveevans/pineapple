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
import type { EventBus } from "../ports/EventBus.ts";

export type DeleteMaintenanceTaskCommand = {
  taskId: MaintenanceTaskId;
  assetId: AssetId;
  requesterId: UserId;
};

export class DeleteMaintenanceTask {
  constructor(
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteMaintenanceTaskCommand): Promise<Result<void, DomainError>> {
    try {
      const task = await this.tasks.findById(command.taskId);
      if (!task) return err(new NotFoundError("Maintenance task not found"));
      if (task.ownerId !== command.requesterId) {
        return err(new ForbiddenError("Access denied"));
      }
      if (task.assetId !== command.assetId) {
        return err(new NotFoundError("Maintenance task not found"));
      }

      task.remove(command.requesterId);
      await this.tasks.delete(task.id);
      await this.eventBus.publishAll(task.pullEvents());
      return ok(undefined);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
