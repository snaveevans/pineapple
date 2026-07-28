import { apiDelete, apiGet, apiPost } from "./client.ts";
import type { components } from "./schema.ts";

export type IntervalUnit = components["schemas"]["MaintenanceTask"]["intervalUnit"];
export type TaskUrgencyStatus = components["schemas"]["MaintenanceTask"]["status"];
export type MaintenanceTask = components["schemas"]["MaintenanceTask"];
export type MaintenanceTaskListResponse = components["schemas"]["MaintenanceTaskListResponse"];
export type CreateMaintenanceTaskBody = components["schemas"]["CreateMaintenanceTaskBody"];

export const maintenanceTasksQueryKey = (assetId: string) => ["maintenanceTasks", assetId] as const;

export function listMaintenanceTasks(assetId: string): Promise<MaintenanceTaskListResponse> {
  return apiGet("/api/assets/{assetId}/maintenance-tasks", { path: { assetId } });
}

export function createMaintenanceTask(
  assetId: string,
  body: CreateMaintenanceTaskBody,
): Promise<MaintenanceTask> {
  return apiPost("/api/assets/{assetId}/maintenance-tasks", { path: { assetId }, body });
}

export function deleteMaintenanceTask(assetId: string, taskId: string): Promise<void> {
  return apiDelete("/api/assets/{assetId}/maintenance-tasks/{taskId}", {
    path: { assetId, taskId },
  });
}
