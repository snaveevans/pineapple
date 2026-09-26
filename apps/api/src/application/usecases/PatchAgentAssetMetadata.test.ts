import { describe, expect, it } from "vitest";
import { ValidationError } from "@snaveevans/pineapple-shared";
import { mergeAgentAssetMetadataPatch } from "./PatchAgentAssetMetadata.ts";

describe("mergeAgentAssetMetadataPatch", () => {
  it("preserves omitted property fields, including street, and clears only explicit nulls", () => {
    const result = mergeAgentAssetMetadataPatch(
      {
        kind: "property",
        nickname: "Cabin",
        address: {
          street: "23 Hidden Road",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          country: "US",
        },
      },
      { kind: "property", nickname: null, address: { city: "Boulder" } },
    );

    expect(result).toEqual({
      kind: "property",
      address: {
        street: "23 Hidden Road",
        city: "Boulder",
        state: "CO",
        postalCode: "80202",
        country: "US",
      },
    });
  });

  it("preserves omitted optional metadata and removes explicitly cleared values", () => {
    expect(
      mergeAgentAssetMetadataPatch(
        { kind: "vehicle", make: "Ford", model: "F-150", year: 2020, vin: "12345678901234567" },
        { kind: "vehicle", model: "F-250", vin: null },
      ),
    ).toEqual({ kind: "vehicle", make: "Ford", model: "F-250", year: 2020 });

    expect(
      mergeAgentAssetMetadataPatch(
        { kind: "equipment", manufacturer: "Honda", modelNumber: "EU2200i", serialNumber: "SN" },
        { kind: "equipment", modelNumber: null },
      ),
    ).toEqual({ kind: "equipment", manufacturer: "Honda", serialNumber: "SN" });
  });

  it("rejects a metadata patch whose kind differs from the current asset", () => {
    expect(() =>
      mergeAgentAssetMetadataPatch(
        { kind: "equipment", manufacturer: "Honda" },
        { kind: "property", address: { city: "Denver" } },
      ),
    ).toThrow(ValidationError);
  });
});
