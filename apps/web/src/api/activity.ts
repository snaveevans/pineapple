import { apiGet } from "./client.ts";
import type { components, paths } from "./schema.ts";

export type ActivityEntryType = components["schemas"]["ActivityEntry"]["type"];
export type ActivityAssetSnapshot = components["schemas"]["ActivityAssetSnapshot"];
export type ActivityActorSnapshot = components["schemas"]["ActivityActorSnapshot"];
export type ActivityEntry = components["schemas"]["ActivityEntry"];
export type ActivityTypeFilter = components["schemas"]["ActivityTypeFilter"];
export type ActivityAssetFilter = components["schemas"]["ActivityAssetFilter"];
export type ActivityAvailableFilters = components["schemas"]["ActivityAvailableFilters"];
export type ActivityResponse = components["schemas"]["ActivityResponse"];

type ActivityQuery = NonNullable<paths["/api/activity"]["get"]["parameters"]["query"]>;

export type ActivityFilters = Pick<ActivityQuery, "type" | "assetId">;
export type ListActivityParams = ActivityQuery;

export const activityQueryKey = (filters: ActivityFilters) =>
  ["activity", filters.type ?? "all", filters.assetId ?? "all"] as const;

export function listActivity(params: ListActivityParams = {}): Promise<ActivityResponse> {
  return apiGet("/api/activity", { query: params });
}
