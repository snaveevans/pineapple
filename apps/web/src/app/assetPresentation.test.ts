import { describe, expect, it } from "vitest";
import type { AssetResponse } from "../api/assets";
import { shortenAssetId, toAssetPresentation } from "./assetPresentation";

const BASE_ASSET = {
  id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
  archivedAt: null,
  createdAt: "2026-05-29T03:25:24.887Z",
  updatedAt: "2026-05-29T03:25:24.887Z",
  sharing: { scope: "personal" as const, isOwner: true },
} as const;

describe("shortenAssetId", () => {
  it("uses the first eight UUID characters for display", () => {
    expect(shortenAssetId(BASE_ASSET.id)).toBe("195D0EF0");
  });
});

describe("toAssetPresentation", () => {
  it("builds a vehicle summary", () => {
    const asset: AssetResponse = {
      ...BASE_ASSET,
      name: "Truck",
      type: "vehicle",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    };

    expect(toAssetPresentation(asset)).toMatchObject({
      cat: "vehicle",
      icon: "truck",
      summary: "2016 Ram 2500",
    });
  });

  it("builds a property summary", () => {
    const asset: AssetResponse = {
      ...BASE_ASSET,
      name: "Main house",
      type: "property",
      metadata: {
        kind: "property",
        address: {
          street: "12 Oak St",
          city: "Portland",
          state: "OR",
          postalCode: "97204",
          country: "United States",
        },
      },
    };

    expect(toAssetPresentation(asset)).toMatchObject({
      cat: "property",
      icon: "home",
      summary: "12 Oak St, Portland, OR",
    });
  });

  it("falls back gracefully when equipment details are blank", () => {
    const asset: AssetResponse = {
      ...BASE_ASSET,
      name: "Pressure washer",
      type: "equipment",
      metadata: { kind: "equipment" },
    };

    expect(toAssetPresentation(asset)).toMatchObject({
      cat: "equipment",
      icon: "wrench",
      summary: "Equipment details not added",
    });
  });
});
