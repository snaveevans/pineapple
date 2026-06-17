import { apiRequest } from "./client.ts";

export type IntervalUnit = "day" | "week" | "month" | "year";
export type TaskUrgencyStatus = "overdue" | "soon" | "ok";

export type MaintenanceTask = {
  id: string;
  assetId: string;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastCompletedDate: string | null;
  nextDue: string;
  status: TaskUrgencyStatus;
  daysDue: number;
  createdAt: string;
};

export type MaintenanceTaskListResponse = {
  maintenanceTasks: MaintenanceTask[];
};

export type CreateMaintenanceTaskBody = {
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastCompletedDate?: string;
};

export const maintenanceTasksQueryKey = (assetId: string) => ["maintenanceTasks", assetId] as const;

export function listMaintenanceTasks(assetId: string): Promise<MaintenanceTaskListResponse> {
  return apiRequest<MaintenanceTaskListResponse>(`/api/assets/${assetId}/maintenance-tasks`);
}

export function createMaintenanceTask(
  assetId: string,
  body: CreateMaintenanceTaskBody,
): Promise<MaintenanceTask> {
  return apiRequest<MaintenanceTask>(`/api/assets/${assetId}/maintenance-tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteMaintenanceTask(assetId: string, taskId: string): Promise<void> {
  return apiRequest<void>(`/api/assets/${assetId}/maintenance-tasks/${taskId}`, {
    method: "DELETE",
  });
}
