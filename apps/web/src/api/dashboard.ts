import { apiGet } from "./client.ts";
import type { components } from "./schema.ts";
import type { AssetSharing, AssetType } from "./assets.ts";

export type { AssetSharing, AssetType };

export type TaskUrgencyStatus = components["schemas"]["MaintenanceTask"]["status"];
export type DashboardFleetTotals = components["schemas"]["DashboardFleetTotals"];
export type DashboardFleetHealth = components["schemas"]["DashboardFleetHealth"];
export type DashboardQueueCounts = components["schemas"]["DashboardQueueCounts"];
export type DashboardQueueItem = components["schemas"]["DashboardQueueItem"];
export type DashboardResponse = components["schemas"]["DashboardResponse"];

export const dashboardQueryKey = ["dashboard"] as const;

export function getDashboard(): Promise<DashboardResponse> {
  return apiGet("/api/dashboard");
}
