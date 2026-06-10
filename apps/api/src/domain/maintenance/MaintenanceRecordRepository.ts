import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { MaintenanceRecord } from "./MaintenanceRecord.ts";

export interface MaintenanceRecordRepository {
  /** Returns records ordered by performedAt DESC, then createdAt DESC. */
  findByAsset(assetId: AssetId, ownerId: UserId): Promise<MaintenanceRecord[]>;
  save(record: MaintenanceRecord): Promise<void>;
}
