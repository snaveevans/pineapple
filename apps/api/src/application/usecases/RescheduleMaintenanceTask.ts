import {
  type AssetId,
  ConflictError,
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
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceTaskWriter } from "../ports/MaintenanceTaskWriter.ts";
import type { MaintenanceWriteGate } from "../ports/MaintenanceWriteGate.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { canAccessAsset } from "./assetAccess.ts";

const MAX_CAS_ATTEMPTS = 4;

export type RescheduleMaintenanceTaskCommand = {
  taskId: MaintenanceTaskId;
  assetId: AssetId;
  requesterId: UserId;
  nextDue: string;
};

export class RescheduleMaintenanceTask {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly taskWriter: MaintenanceTaskWriter,
    private readonly eventBus: EventBus,
    private readonly dates: UtcDateProvider,
    private readonly writeGate?: MaintenanceWriteGate,
  ) {}

  async execute(
    command: RescheduleMaintenanceTaskCommand,
  ): Promise<Result<MaintenanceTask, DomainError>> {
    try {
      if (this.writeGate && !(await this.writeGate.isWritable())) {
        return err(
          new ServiceUnavailableError("Changes are temporarily paused", "maintenance_write_frozen"),
        );
      }

      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
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

        // Rescheduling an existing task on an archived asset is permitted,
        // matching task edit and deletion; only new tasks/records are blocked.

        const expectedTaskRevision = task.revision;
        const changed = task.reschedule(command.nextDue, this.dates.today(), command.requesterId, {
          assetName: asset.name,
          assetType: asset.type,
        });

        if (!changed) {
          return ok(task);
        }

        const events = task.pullEvents();
        const success = await this.taskWriter.updateWithRevision(
          task,
          expectedTaskRevision,
          events,
        );

        if (success) {
          await this.eventBus.publishAll(events);
          return ok(task);
        }
      }

      return err(new ConflictError("Concurrent modification conflict"));
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
