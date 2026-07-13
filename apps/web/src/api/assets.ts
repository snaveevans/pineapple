import type { AssetCategoryCounts, AssetType } from "@snaveevans/pineapple-shared";
import { apiRequest } from "./client";

export type { AssetCategoryCounts, AssetType } from "@snaveevans/pineapple-shared";

export type VehicleMetadata = {
  kind: "vehicle";
  make: string;
  model: string;
  year: number;
  vin?: string;
};

export type PropertyMetadata = {
  kind: "property";
  nickname?: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
};

export type EquipmentMetadata = {
  kind: "equipment";
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
};

export type AssetMetadata = VehicleMetadata | PropertyMetadata | EquipmentMetadata;

export type AssetSharing = {
  scope: "personal" | "team";
  isOwner: boolean;
  ownerDisplayName?: string;
};

export type AssetResponse = {
  id: string;
  name: string;
  type: AssetType;
  metadata: AssetMetadata;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sharing: AssetSharing;
};

export type AssetListResponse = {
  assets: AssetResponse[];
  counts: AssetCategoryCounts;
};

export type CreateAssetBody = {
  name: string;
  metadata: AssetMetadata;
};

export type CreatedAssetResponse = {
  id: string;
};

export const assetsQueryKey = ["assets"] as const;
export const assetQueryKey = (id: string) => ["asset", id] as const;

export function getAsset(id: string): Promise<AssetResponse> {
  return apiRequest<AssetResponse>(`/api/assets/${id}`);
}

export function listAssets(): Promise<AssetListResponse> {
  return apiRequest<AssetListResponse>("/api/assets");
}

export function createAsset(body: CreateAssetBody): Promise<CreatedAssetResponse> {
  return apiRequest<CreatedAssetResponse>("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function shareAsset(assetId: string): Promise<AssetResponse> {
  return apiRequest<AssetResponse>(`/api/assets/${assetId}/share`, { method: "POST" });
}

export function unshareAsset(assetId: string): Promise<AssetResponse> {
  return apiRequest<AssetResponse>(`/api/assets/${assetId}/share`, { method: "DELETE" });
}
