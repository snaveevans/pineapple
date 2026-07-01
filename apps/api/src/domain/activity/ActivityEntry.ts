import type { ActivityEntryId, AssetId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../asset/AssetType.ts";

export const ACTIVITY_ENTRY_TYPES = [
  "asset_added",
  "maintenance_logged",
  "task_completed",
  "task_scheduled",
  "task_deleted",
] as const;

export type ActivityEntryType = (typeof ACTIVITY_ENTRY_TYPES)[number];

export type ActivityAssetSnapshot = {
  id: AssetId;
  name: string;
  type: AssetType;
};

export type ActivityEntry = {
  id: ActivityEntryId;
  type: ActivityEntryType;
  occurredAt: Date;
  asset: ActivityAssetSnapshot;
  title?: string;
  performedAt?: string;
};

export type ActivityTypeFilter = {
  type: ActivityEntryType;
  count: number;
};

export type ActivityAssetFilter = {
  asset: ActivityAssetSnapshot;
  count: number;
};

export type ActivityAvailableFilters = {
  types: ActivityTypeFilter[];
  assets: ActivityAssetFilter[];
};

export type ActivityReadModel = {
  entries: ActivityEntry[];
  availableFilters: ActivityAvailableFilters;
  nextCursor: string | null;
};
