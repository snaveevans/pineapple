import {
  type AssetId,
  ConflictError,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  type MaintenanceTaskId,
  NotFoundError,
  type Result,
  type UserId,
  ValidationError,
  err,
  ok,
} from "@snaveevans/pineapple-shared";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";

export type CreateMaintenanceRecordCommand = {
  assetId: AssetId;
  requesterId: UserId;
  title: string;
  performedAt: string;
  notes?: string;
  taskId?: MaintenanceTaskId;
};

export class CreateMaintenanceRecord {
  constructor(
    private readonly assets: AssetRepository,
    private readonly records: MaintenanceRecordRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
    private readonly dates: UtcDateProvider,
  ) {}

  async execute(
    command: CreateMaintenanceRecordCommand,
  ): Promise<Result<MaintenanceRecord, DomainError>> {
    try {
      const asset = await this.assets.findById(command.assetId);
      if (!asset) return err(new NotFoundError("Asset not found"));
      if (asset.ownerId !== command.requesterId) {
        return err(new ForbiddenError("Access denied"));
      }
      if (asset.archivedAt !== null) {
        return err(new ConflictError("Cannot add maintenance to an archived asset"));
      }

      let task = null;
      if (command.taskId !== undefined) {
        task = await this.tasks.findById(command.taskId);
        if (!task || task.ownerId !== command.requesterId) {
          return err(new NotFoundError("Maintenance task not found"));
        }
        if (task.assetId !== command.assetId) {
          return err(new ValidationError("Task does not belong to this asset", "taskId"));
        }
      }

      const record = MaintenanceRecord.create({
        assetId: asset.id,
        ownerId: asset.ownerId,
        actorId: command.requesterId,
        title: command.title,
        performedAt: command.performedAt,
        ...(command.notes !== undefined ? { notes: command.notes } : {}),
        ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
        todayUtc: this.dates.today(),
      });
      await this.records.save(record);
      await this.eventBus.publishAll(record.pullEvents());

      if (task !== null) {
        const advanced = task.advance(record.performedAt, record.id, command.requesterId);
        if (advanced) {
          await this.tasks.save(task);
          await this.eventBus.publishAll(task.pullEvents());
        }
      }

      return ok(record);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
