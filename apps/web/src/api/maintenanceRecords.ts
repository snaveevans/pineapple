import { apiRequest } from "./client.ts";

export type MaintenanceRecord = {
  id: string;
  assetId: string;
  title: string;
  performedAt: string;
  notes: string | null;
  createdAt: string;
};

export type MaintenanceRecordListResponse = {
  maintenanceRecords: MaintenanceRecord[];
};

export type CreateMaintenanceRecordBody = {
  title: string;
  performedAt: string;
  notes?: string;
};

export const maintenanceRecordsQueryKey = (assetId: string) =>
  ["maintenanceRecords", assetId] as const;

export function listMaintenanceRecords(assetId: string): Promise<MaintenanceRecordListResponse> {
  return apiRequest<MaintenanceRecordListResponse>(`/api/assets/${assetId}/maintenance-records`);
}

export function createMaintenanceRecord(
  assetId: string,
  body: CreateMaintenanceRecordBody,
): Promise<MaintenanceRecord> {
  return apiRequest<MaintenanceRecord>(`/api/assets/${assetId}/maintenance-records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
