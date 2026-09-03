import { apiDelete, apiGet, apiPatch, apiPost } from "./client.ts";
import type { components } from "./schema.ts";

export type IntervalUnit = components["schemas"]["MaintenanceTask"]["intervalUnit"];
export type TaskUrgencyStatus = components["schemas"]["MaintenanceTask"]["status"];
export type MaintenanceTask = components["schemas"]["MaintenanceTask"];
export type MaintenanceTaskListResponse = components["schemas"]["MaintenanceTaskListResponse"];
export type CreateMaintenanceTaskBody = components["schemas"]["CreateMaintenanceTaskBody"];
export type UpdateMaintenanceTaskBody = components["schemas"]["UpdateMaintenanceTaskBody"];
export type RescheduleMaintenanceTaskBody = components["schemas"]["RescheduleMaintenanceTaskBody"];

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

export function updateMaintenanceTask(
  assetId: string,
  taskId: string,
  body: UpdateMaintenanceTaskBody,
): Promise<MaintenanceTask> {
  return apiPatch("/api/assets/{assetId}/maintenance-tasks/{taskId}", {
    path: { assetId, taskId },
    body,
  });
}

export function rescheduleMaintenanceTask(
  assetId: string,
  taskId: string,
  body: RescheduleMaintenanceTaskBody,
): Promise<MaintenanceTask> {
  return apiPost("/api/assets/{assetId}/maintenance-tasks/{taskId}/reschedule", {
    path: { assetId, taskId },
    body,
  });
}
