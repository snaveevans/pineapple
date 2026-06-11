import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { MaintenanceTask } from "./MaintenanceTask.ts";

export interface MaintenanceTaskRepository {
  /** Returns tasks ordered by nextDue ASC. */
  findByAsset(assetId: AssetId, ownerId: UserId): Promise<MaintenanceTask[]>;
  findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null>;
  save(task: MaintenanceTask): Promise<void>;
  /** Nulls task_id on linked maintenance_records, then deletes the task. */
  delete(taskId: MaintenanceTaskId): Promise<void>;
}
