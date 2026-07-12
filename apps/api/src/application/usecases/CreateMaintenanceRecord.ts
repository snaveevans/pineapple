import {
  type AssetId,
  ConflictError,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  InvariantError,
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
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceRecordWriter } from "../ports/MaintenanceRecordWriter.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { canAccessAsset } from "./assetAccess.ts";

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
    private readonly teams: TeamRepository,
    private readonly records: MaintenanceRecordWriter,
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
      if (!(await canAccessAsset(asset, command.requesterId, this.teams))) {
        return err(new ForbiddenError("Access denied"));
      }
      if (asset.archivedAt !== null) {
        return err(new ConflictError("Cannot add maintenance to an archived asset"));
      }

      let task = null;
      if (command.taskId !== undefined) {
        task = await this.tasks.findById(command.taskId);
        if (!task) {
          return err(new NotFoundError("Maintenance task not found"));
        }
        if (task.assetId !== command.assetId) {
          return err(new ValidationError("Task does not belong to this asset", "taskId"));
        }
      }

      const linkedTaskWillAdvance = task !== null && task.willAdvance(command.performedAt);
      const record = MaintenanceRecord.create({
        assetId: asset.id,
        ownerId: asset.ownerId,
        actorId: command.requesterId,
        assetName: asset.name,
        assetType: asset.type,
        title: command.title,
        performedAt: command.performedAt,
        ...(command.notes !== undefined ? { notes: command.notes } : {}),
        ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
        activityEntryType: linkedTaskWillAdvance ? null : "maintenance_logged",
        todayUtc: this.dates.today(),
      });

      const advancedTask =
        task !== null &&
        task.advance(record.performedAt, record.id, command.requesterId, {
          assetName: asset.name,
          assetType: asset.type,
        })
          ? task
          : null;
      if (linkedTaskWillAdvance !== (advancedTask !== null)) {
        throw new InvariantError("Maintenance task advancement state changed while logging record");
      }

      const recordEvents = record.pullEvents();
      const taskEvents = advancedTask !== null ? advancedTask.pullEvents() : [];
      await this.records.save(record, advancedTask, [...recordEvents, ...taskEvents]);

      await this.eventBus.publishAll(recordEvents);
      if (advancedTask !== null) {
        await this.eventBus.publishAll(taskEvents);
      }

      return ok(record);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
