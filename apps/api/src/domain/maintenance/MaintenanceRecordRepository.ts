import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { MaintenanceRecord } from "./MaintenanceRecord.ts";

export interface MaintenanceRecordRepository {
  findById(id: MaintenanceRecordId): Promise<MaintenanceRecord | null>;
  /** Returns records ordered by performedAt DESC, then createdAt DESC. */
  findByAsset(assetId: AssetId, ownerId: UserId): Promise<MaintenanceRecord[]>;
  findByTask(taskId: MaintenanceTaskId): Promise<MaintenanceRecord[]>;
  save(record: MaintenanceRecord): Promise<void>;
}
