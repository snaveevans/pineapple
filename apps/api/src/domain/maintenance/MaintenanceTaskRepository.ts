import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../events/DomainEvent.ts";
import type { MaintenanceTask } from "./MaintenanceTask.ts";

export interface MaintenanceTaskRepository {
  /** Returns tasks ordered by nextDue ASC. Ownership is verified at the use-case layer. */
  findByAsset(assetId: AssetId): Promise<MaintenanceTask[]>;
  /**
   * Tasks on active assets the caller can see (owns or shared to their team),
   * ordered by nextDue ASC then createdAt ASC.
   */
  findForVisibleActiveAssets(userId: UserId): Promise<MaintenanceTask[]>;
  findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null>;
  save(task: MaintenanceTask, events?: readonly DomainEvent[]): Promise<void>;
  /** Nulls task_id on linked maintenance_records, then deletes the task. */
  delete(taskId: MaintenanceTaskId, events?: readonly DomainEvent[]): Promise<void>;
}
