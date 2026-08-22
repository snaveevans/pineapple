import {
  type AssetId,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  type MaintenanceTaskId,
  NotFoundError,
  type Result,
  ServiceUnavailableError,
  type UserId,
  err,
  ok,
} from "@snaveevans/pineapple-shared";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { IntervalUnit } from "../../domain/maintenance/IntervalUnit.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceWriteGate } from "../ports/MaintenanceWriteGate.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { canAccessAsset } from "./assetAccess.ts";

export type UpdateMaintenanceTaskCommand = {
  taskId: MaintenanceTaskId;
  assetId: AssetId;
  requesterId: UserId;
  title?: string;
  intervalValue?: number;
  intervalUnit?: IntervalUnit;
};

export class UpdateMaintenanceTask {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
    private readonly dates: UtcDateProvider,
    private readonly writeGate?: MaintenanceWriteGate,
  ) {}

  async execute(
    command: UpdateMaintenanceTaskCommand,
  ): Promise<Result<MaintenanceTask, DomainError>> {
    try {
      if (this.writeGate && !(await this.writeGate.isWritable())) {
        return err(
          new ServiceUnavailableError("Changes are temporarily paused", "maintenance_write_frozen"),
        );
      }

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

      const changed = task.update(
        {
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.intervalValue !== undefined ? { intervalValue: command.intervalValue } : {}),
          ...(command.intervalUnit !== undefined ? { intervalUnit: command.intervalUnit } : {}),
          todayUtc: this.dates.today(),
        },
        command.requesterId,
        { assetName: asset.name, assetType: asset.type },
      );

      if (changed) {
        const events = task.pullEvents();
        await this.tasks.save(task, events);
        await this.eventBus.publishAll(events);
      }

      return ok(task);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
