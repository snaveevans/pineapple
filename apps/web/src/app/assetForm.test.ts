import { describe, expect, it } from "vitest";
import {
  EMPTY_ASSET_FORM,
  toAssetFormError,
  toCreateAssetBody,
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
