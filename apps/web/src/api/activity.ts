import type { AssetType } from "./assets.ts";
import { apiRequest } from "./client.ts";

export type ActivityEntryType =
  | "asset_added"
  | "maintenance_logged"
  | "task_completed"
  | "task_scheduled"
  | "task_deleted";

export type ActivityAssetSnapshot = {
  id: string;
  name: string;
  type: AssetType;
};

export type ActivityEntry = {
  id: string;
  type: ActivityEntryType;
  occurredAt: string;
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

export type ActivityResponse = {
  entries: ActivityEntry[];
  availableFilters: ActivityAvailableFilters;
  nextCursor: string | null;
};

export type ActivityFilters = {
  type?: ActivityEntryType;
  assetId?: string;
};

export type ListActivityParams = ActivityFilters & {
  cursor?: string;
  limit?: number;
};

export const activityQueryKey = (filters: ActivityFilters) =>
  ["activity", filters.type ?? "all", filters.assetId ?? "all"] as const;

export function listActivity(params: ListActivityParams = {}): Promise<ActivityResponse> {
  const query = new URLSearchParams();
  if (params.type !== undefined) query.set("type", params.type);
  if (params.assetId !== undefined) query.set("assetId", params.assetId);
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<ActivityResponse>(`/api/activity${suffix}`);
}
