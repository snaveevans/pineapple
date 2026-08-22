import {
  type AssetId,
  ConflictError,
  type DomainError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  type MaintenanceRecordId,
  NotFoundError,
  type Result,
  ServiceUnavailableError,
  type UserId,
  err,
  ok,
} from "@snaveevans/pineapple-shared";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceRecordWriter } from "../ports/MaintenanceRecordWriter.ts";
import type { MaintenanceWriteGate } from "../ports/MaintenanceWriteGate.ts";
import { canAccessAsset } from "./assetAccess.ts";

const MAX_CAS_ATTEMPTS = 4;

export type DeleteMaintenanceRecordCommand = {
  assetId: AssetId;
  recordId: MaintenanceRecordId;
  requesterId: UserId;
};

export class DeleteMaintenanceRecord {
  constructor(
    private readonly assets: AssetRepository,
    private readonly teams: TeamRepository,
    private readonly records: MaintenanceRecordRepository,
    private readonly recordWriter: MaintenanceRecordWriter,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly eventBus: EventBus,
    private readonly writeGate?: MaintenanceWriteGate,
  ) {}

  async execute(command: DeleteMaintenanceRecordCommand): Promise<Result<void, DomainError>> {
    try {
      if (this.writeGate && !(await this.writeGate.isWritable())) {
        return err(
          new ServiceUnavailableError("Changes are temporarily paused", "maintenance_write_frozen"),
        );
      }

      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const asset = await this.assets.findById(command.assetId);
        if (!asset) return err(new NotFoundError("Asset not found"));

        const record = await this.records.findById(command.recordId);
        if (!record || record.assetId !== command.assetId) {
          return err(new NotFoundError("Maintenance record not found"));
        }

        if (!(await canAccessAsset(asset, command.requesterId, this.teams))) {
          return err(new ForbiddenError("Access denied"));
        }

        if (asset.archivedAt !== null) {
          return err(new ConflictError("Cannot delete maintenance on an archived asset"));
        }

        const expectedRecordRevision = record.revision;
        const assetSnapshot = { assetName: asset.name, assetType: asset.type };

        record.delete(command.requesterId, assetSnapshot);

        let task = null;
        let expectedTaskRevision: number | undefined = undefined;
        let taskReconciled = false;

        if (record.taskId !== null) {
          task = await this.tasks.findById(record.taskId);
          if (task) {
            expectedTaskRevision = task.revision;
            const taskRecords = await this.records.findByTask(task.id);
            const survivingRecords = taskRecords
              .filter((r) => r.id !== record.id)
              .map((r) => ({ performedAt: r.performedAt }));
            taskReconciled = task.reconcile(
              survivingRecords,
              record.id,
              command.requesterId,
              assetSnapshot,
            );
          }
        }

        const recordEvents = record.pullEvents();
        const taskEvents = task && taskReconciled ? task.pullEvents() : [];

        const success = await this.recordWriter.delete(
          record,
          expectedRecordRevision,
          taskReconciled ? task : null,
          expectedTaskRevision,
          [...recordEvents, ...taskEvents],
        );

        if (success) {
          await this.eventBus.publishAll(recordEvents);
          if (task && taskReconciled) {
            await this.eventBus.publishAll(taskEvents);
          }
          return ok(undefined);
        }
      }

      return err(new ConflictError("Concurrent modification conflict"));
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
