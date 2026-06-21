import type { AssetCategoryCounts, AssetType } from "../api/assets";
import type { AssetPresentation } from "./assetPresentation";

export type AssetFilter = "all" | AssetType;
export type AssetView = "grid" | "list";

export const ASSET_VIEW_STORAGE_KEY = "fieldops:assets:view";

const ASSET_FILTER_LABELS: Record<AssetFilter, string> = {
  all: "All",
  vehicle: "Vehicles",
  equipment: "Equipment",
  property: "Properties",
};

export function assetFilterOptions(counts: AssetCategoryCounts) {
  return (Object.keys(ASSET_FILTER_LABELS) as AssetFilter[]).map((id) => ({
    id,
    label: ASSET_FILTER_LABELS[id],
    count: counts[id],
  }));
}

export function assetFilterLabel(filter: AssetFilter): string {
  return ASSET_FILTER_LABELS[filter];
}

export function filterAssets(assets: AssetPresentation[], filter: AssetFilter): AssetPresentation[] {
  return filter === "all" ? assets : assets.filter((asset) => asset.cat === filter);
}

export function assetCountCopy(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"} you take care of`;
}

export function assetViewFromStorage(value: string | null): AssetView {
  return value === "list" ? "list" : "grid";
}
