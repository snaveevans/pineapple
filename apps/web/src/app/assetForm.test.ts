import { describe, expect, it } from "vitest";
import type { AssetResponse } from "../api/assets";
import {
  EMPTY_ASSET_FORM,
  assetToForm,
  toAssetFormError,
  toCreateAssetBody,
  toEditAssetBody,
  validateAssetForm,
} from "./assetForm";

describe("toCreateAssetBody", () => {
  it("maps a trimmed vehicle and omits a blank VIN", () => {
    expect(
      toCreateAssetBody("vehicle", {
        ...EMPTY_ASSET_FORM,
        name: "  Truck  ",
        make: "  Ram ",
        model: " 2500 ",
        year: "2016",
        vin: " ",
      }),
    ).toEqual({
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  });

  it("maps a property address and omits a blank nickname", () => {
    expect(
      toCreateAssetBody("property", {
        ...EMPTY_ASSET_FORM,
        name: " Main house ",
        nickname: " ",
        street: " 12 Oak St ",
        city: " Portland ",
        state: " OR ",
        postal: " 97204 ",
      }),
    ).toEqual({
      name: "Main house",
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
    });
  });

  it("maps equipment and omits blank optional fields", () => {
    expect(
      toCreateAssetBody("equipment", {
        ...EMPTY_ASSET_FORM,
        name: " Generator ",
        manufacturer: " Honda ",
        modelNumber: " ",
        serialNumber: " EAMT-123 ",
      }),
    ).toEqual({
      name: "Generator",
      metadata: { kind: "equipment", manufacturer: "Honda", serialNumber: "EAMT-123" },
    });
  });
});

describe("validateAssetForm", () => {
  it("requires state for a property", () => {
    const errors = validateAssetForm("property", {
      ...EMPTY_ASSET_FORM,
      name: "Cabin",
      street: "12 Oak St",
      city: "Portland",
      postal: "97204",
    });

    expect(errors.state).toBe("Required.");
  });

  it("rejects a vehicle year beyond the API limit", () => {
    const errors = validateAssetForm("vehicle", {
      ...EMPTY_ASSET_FORM,
      name: "Truck",
      make: "Ram",
      model: "2500",
      year: String(new Date().getFullYear() + 2),
    });

    expect(errors.year).toContain("Must be between");
  });
});

describe("toAssetFormError", () => {
  it("maps an API metadata path back to its form field", () => {
    expect(toAssetFormError("metadata.address.postalCode", "Postal code is required")).toEqual({
      postal: "Postal code is required",
    });
  });
});

describe("toEditAssetBody", () => {
  it("maps the same shape as toCreateAssetBody", () => {
    const form = { ...EMPTY_ASSET_FORM, name: " Truck ", make: "Ram", model: "2500", year: "2016" };
    expect(toEditAssetBody("vehicle", form)).toEqual(toCreateAssetBody("vehicle", form));
  });
});

describe("assetToForm", () => {
  function baseAsset(overrides: Partial<AssetResponse> = {}): AssetResponse {
    return {
      id: "asset-1",
      name: "Truck",
      type: "vehicle",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "personal", isOwner: true },
      ...overrides,
    };
  }

  it("prefills vehicle fields, including an optional VIN", () => {
    const asset = baseAsset({
      metadata: {
        kind: "vehicle",
        make: "Ram",
        model: "2500",
        year: 2016,
        vin: "1C6RR7LT4GS123456",
      },
    });

    expect(assetToForm(asset)).toMatchObject({
      name: "Truck",
      make: "Ram",
      model: "2500",
      year: "2016",
      vin: "1C6RR7LT4GS123456",
    });
  });

  it("prefills property fields and defaults a missing nickname to blank", () => {
    const asset = baseAsset({
      name: "Cabin",
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
    });

    expect(assetToForm(asset)).toMatchObject({
      name: "Cabin",
      nickname: "",
      street: "12 Oak St",
      city: "Portland",
      state: "OR",
      postal: "97204",
      country: "United States",
    });
  });

  it("prefills equipment fields, defaulting missing optionals to blank", () => {
    const asset = baseAsset({
      name: "Generator",
      type: "equipment",
      metadata: { kind: "equipment", manufacturer: "Honda" },
    });

    expect(assetToForm(asset)).toMatchObject({
      name: "Generator",
      manufacturer: "Honda",
      modelNumber: "",
      serialNumber: "",
    });
  });

  it("round-trips through toEditAssetBody back to the original metadata", () => {
    const asset = baseAsset({
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });

    expect(toEditAssetBody("vehicle", assetToForm(asset))).toEqual({
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  });
});
