import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { ActivityEntryType, ActivityReadModel } from "../../domain/activity/ActivityEntry.ts";

export type ActivityLogQuery = {
  ownerId: UserId;
  limit: number;
  type?: ActivityEntryType;
  assetId?: AssetId;
  cursor?: string;
};

export interface ActivityLogRepository {
  list(query: ActivityLogQuery): Promise<ActivityReadModel>;
}
