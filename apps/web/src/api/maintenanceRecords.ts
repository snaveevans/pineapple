import { apiGet, apiPost } from "./client.ts";
import type { components } from "./schema.ts";

export type MaintenanceRecord = components["schemas"]["MaintenanceRecord"];
export type MaintenanceRecordListResponse = components["schemas"]["MaintenanceRecordListResponse"];
export type CreateMaintenanceRecordBody = components["schemas"]["CreateMaintenanceRecordBody"];

export const maintenanceRecordsQueryKey = (assetId: string) =>
  ["maintenanceRecords", assetId] as const;

export function listMaintenanceRecords(assetId: string): Promise<MaintenanceRecordListResponse> {
  return apiGet("/api/assets/{assetId}/maintenance-records", { path: { assetId } });
}

export function createMaintenanceRecord(
  assetId: string,
  body: CreateMaintenanceRecordBody,
): Promise<MaintenanceRecord> {
  return apiPost("/api/assets/{assetId}/maintenance-records", { path: { assetId }, body });
}
