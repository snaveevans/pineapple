import type { AssetResponse, AssetType } from "../api/assets";
import type { IconName } from "../design/Icon";
import type { AssetCategory } from "../design/hf";

export type AssetPresentation = {
  id: string;
  displayId: string;
  name: string;
  cat: AssetCategory;
  icon: IconName;
  summary: string;
};

export function shortenAssetId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function assetTypeLabel(type: AssetType): string {
  switch (type) {
    case "vehicle":
      return "Vehicle";
    case "property":
      return "Property";
    case "equipment":
      return "Equipment";
  }
}

export function toAssetPresentation(asset: AssetResponse): AssetPresentation {
  const base = {
    id: asset.id,
    displayId: shortenAssetId(asset.id),
    name: asset.name,
  };

  switch (asset.metadata.kind) {
    case "vehicle":
      return {
        ...base,
        cat: "vehicle",
        icon: "truck",
        summary: `${asset.metadata.year} ${asset.metadata.make} ${asset.metadata.model}`,
      };
    case "property":
      return {
        ...base,
        cat: "property",
        icon: "home",
        summary: [
          asset.metadata.address.street,
          asset.metadata.address.city,
          asset.metadata.address.state,
        ].join(", "),
      };
    case "equipment": {
      const summary = [asset.metadata.manufacturer, asset.metadata.modelNumber]
        .filter(Boolean)
        .join(" ");
      return {
        ...base,
        cat: "equipment",
        icon: "wrench",
        summary: summary || asset.metadata.serialNumber || "Equipment details not added",
      };
    }
  }
}
