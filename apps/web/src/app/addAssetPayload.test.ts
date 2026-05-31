import { describe, expect, it } from "vitest";
import { buildCreateAssetPayload, EMPTY_ADD_ASSET_FORM } from "./addAssetPayload";

describe("buildCreateAssetPayload", () => {
  it("normalizes a vehicle payload and uppercases its VIN", () => {
    expect(
      buildCreateAssetPayload("vehicle", {
        ...EMPTY_ADD_ASSET_FORM,
        name: "  Truck  ",
        vehicleMake: " Ram ",
        vehicleModel: " 2500 ",
        vehicleYear: "2016",
        vin: "1c6rr7lt4gs123456",
      }),
    ).toEqual({
      name: "Truck",
      metadata: {
        kind: "vehicle",
        make: "Ram",
        model: "2500",
        year: 2016,
        vin: "1C6RR7LT4GS123456",
      },
    });
  });

  it("maps the UI other bucket to equipment metadata", () => {
    expect(
      buildCreateAssetPayload("other", {
        ...EMPTY_ADD_ASSET_FORM,
        name: " Generator ",
        equipmentManufacturer: " Honda ",
      }),
    ).toEqual({
      name: "Generator",
      metadata: { kind: "equipment", manufacturer: "Honda" },
    });
  });
});
