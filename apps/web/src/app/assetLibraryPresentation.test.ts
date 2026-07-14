import { describe, expect, it } from "vitest";
import type { AssetPresentation } from "./assetPresentation";
import {
  assetCountCopy,
  assetFilterOptions,
  assetViewFromStorage,
  filterAssets,
} from "./assetLibraryPresentation";

const assets: AssetPresentation[] = [
  {
    id: "vehicle-id",
    displayId: "VEHICLE-",
    name: "Truck",
    cat: "vehicle",
    icon: "truck",
    summary: "2020 Ford F-150",
    sharingBadge: null,
  },
  {
    id: "equipment-id",
    displayId: "EQUIPMEN",
    name: "Generator",
    cat: "equipment",
    icon: "wrench",
    summary: "Generac 7043",
    sharingBadge: null,
  },
];

describe("asset library presentation", () => {
  it("uses the API category counts without recomputing them from displayed assets", () => {
    expect(assetFilterOptions({ all: 4, vehicle: 2, equipment: 1, property: 1 })).toEqual([
      { id: "all", label: "All", count: 4 },
      { id: "vehicle", label: "Vehicles", count: 2 },
      { id: "equipment", label: "Equipment", count: 1 },
      { id: "property", label: "Properties", count: 1 },
    ]);
  });

  it("filters the loaded list locally", () => {
    expect(filterAssets(assets, "all")).toEqual(assets);
    expect(filterAssets(assets, "equipment")).toEqual([assets[1]]);
    expect(filterAssets(assets, "property")).toEqual([]);
  });

  it("uses singular count copy and a safe persisted view fallback", () => {
    expect(assetCountCopy(1)).toBe("1 thing you take care of");
    expect(assetCountCopy(0)).toBe("0 things you take care of");
    expect(assetViewFromStorage("list")).toBe("list");
    expect(assetViewFromStorage("grid")).toBe("grid");
    expect(assetViewFromStorage(null)).toBe("grid");
  });
});
