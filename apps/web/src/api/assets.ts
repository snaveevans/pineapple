import { apiDelete, apiGet, apiPatch, apiPost } from "./client.ts";
import type { components } from "./schema.ts";

// Wire shapes come from the spec (docs/reference/openapi.json), not from
// hand-written declarations. The names are kept so callers are unaffected.
export type AssetType = components["schemas"]["Asset"]["type"];
export type AssetCategoryCounts = components["schemas"]["AssetCategoryCounts"];
export type VehicleMetadata = components["schemas"]["VehicleMetadata"];
export type PropertyMetadata = components["schemas"]["PropertyMetadata"];
export type EquipmentMetadata = components["schemas"]["EquipmentMetadata"];
export type AssetMetadata = components["schemas"]["AssetMetadata"];
export type AssetSharing = components["schemas"]["AssetSharing"];
export type AssetResponse = components["schemas"]["Asset"];
export type AssetListResponse = components["schemas"]["AssetListResponse"];
export type CreateAssetBody = components["schemas"]["CreateAssetBody"];
export type CreatedAssetResponse = components["schemas"]["CreatedAsset"];
export type EditAssetBody = components["schemas"]["EditAssetBody"];

export const assetsQueryKey = ["assets"] as const;
export const assetQueryKey = (id: string) => ["asset", id] as const;

export function getAsset(id: string): Promise<AssetResponse> {
  return apiGet("/api/assets/{id}", { path: { id } });
}

export function listAssets(): Promise<AssetListResponse> {
  return apiGet("/api/assets");
}

export function createAsset(body: CreateAssetBody): Promise<CreatedAssetResponse> {
  return apiPost("/api/assets", { body });
}

export function editAsset(id: string, body: EditAssetBody): Promise<AssetResponse> {
  return apiPatch("/api/assets/{id}", { path: { id }, body });
}

export function shareAsset(assetId: string): Promise<AssetResponse> {
  return apiPost("/api/assets/{assetId}/share", { path: { assetId } });
}

export function unshareAsset(assetId: string): Promise<AssetResponse> {
  return apiDelete("/api/assets/{assetId}/share", { path: { assetId } });
}
