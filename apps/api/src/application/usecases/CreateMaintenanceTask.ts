import {
  type AssetId,
  ConflictError,
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
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { IntervalUnit } from "../../domain/maintenance/IntervalUnit.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";

export type CreateMaintenanceTaskCommand = {
  assetId: AssetId;
  requesterId: UserId;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastCompletedDate?: string;
};

export class CreateMaintenanceTask {
  constructor(
    private readonly assets: AssetRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
    private readonly dates: UtcDateProvider,
  ) {}

  async execute(
    command: CreateMaintenanceTaskCommand,
  ): Promise<Result<MaintenanceTask, DomainError>> {
    try {
      const asset = await this.assets.findById(command.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (asset.ownerId !== command.requesterId) {
        return err(new ForbiddenError("Access denied"));
      }
      if (asset.archivedAt !== null) {
        return err(new ConflictError("Cannot add maintenance tasks to an archived asset"));
      }

      const task = MaintenanceTask.create({
        assetId: asset.id,
        ownerId: asset.ownerId,
        actorId: command.requesterId,
        assetName: asset.name,
        assetType: asset.type,
        title: command.title,
        intervalValue: command.intervalValue,
        intervalUnit: command.intervalUnit,
        ...(command.lastCompletedDate !== undefined
          ? { lastCompletedDate: command.lastCompletedDate }
          : {}),
        todayUtc: this.dates.today(),
      });
      const events = task.pullEvents();
      await this.tasks.save(task, events);
      await this.eventBus.publishAll(events);
      return ok(task);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
