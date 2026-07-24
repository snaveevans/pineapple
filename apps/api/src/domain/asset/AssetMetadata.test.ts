import { describe, expect, it } from "vitest";
import { ValidationError } from "@snaveevans/pineapple-shared";
import {
  validateMetadata,
  type Address,
  type AssetMetadata,
  type EquipmentMetadata,
  type PropertyMetadata,
  type VehicleMetadata,
} from "./AssetMetadata.ts";

function expectValidationField(run: () => void, field: string): void {
  try {
    run();
    expect.fail("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe(field);
  }
}

const validAddress: Address = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
};

const validVehicle: VehicleMetadata = {
  kind: "vehicle",
  make: "Ram",
  model: "2500",
  year: 2016,
};

const validProperty: PropertyMetadata = {
  kind: "property",
  address: { ...validAddress },
};

const validEquipment: EquipmentMetadata = {
  kind: "equipment",
  manufacturer: "Honda",
};

describe("validateMetadata", () => {
  describe("vehicle", () => {
    it("accepts valid vehicle metadata", () => {
      expect(() => validateMetadata(validVehicle)).not.toThrow();
    });

    it("accepts a 17-character VIN", () => {
      expect(() => validateMetadata({ ...validVehicle, vin: "1HGBH41JXMN109186" })).not.toThrow();
    });

    it.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["absent", undefined],
    ] as const)("rejects %s make with field metadata.make", (_label, make) => {
      const metadata = { ...validVehicle, make } as VehicleMetadata;
      expectValidationField(() => validateMetadata(metadata), "metadata.make");
    });

    it.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["absent", undefined],
    ] as const)("rejects %s model with field metadata.model", (_label, model) => {
      const metadata = { ...validVehicle, model } as VehicleMetadata;
      expectValidationField(() => validateMetadata(metadata), "metadata.model");
    });

    it("accepts year at the lower bound 1900", () => {
      expect(() => validateMetadata({ ...validVehicle, year: 1900 })).not.toThrow();
    });

    it("rejects year below 1900", () => {
      expectValidationField(
        () => validateMetadata({ ...validVehicle, year: 1899 }),
        "metadata.year",
      );
    });

    it("accepts year at the upper bound currentYear + 1", () => {
      const upper = new Date().getFullYear() + 1;
      expect(() => validateMetadata({ ...validVehicle, year: upper })).not.toThrow();
    });

    it("rejects year above currentYear + 1", () => {
      const above = new Date().getFullYear() + 2;
      expectValidationField(
        () => validateMetadata({ ...validVehicle, year: above }),
        "metadata.year",
      );
    });

    it.each([
      ["too short", "TOOSHORT"],
      ["16 chars", "A".repeat(16)],
      ["18 chars", "A".repeat(18)],
    ] as const)("rejects VIN that is %s with field metadata.vin", (_label, vin) => {
      expectValidationField(() => validateMetadata({ ...validVehicle, vin }), "metadata.vin");
    });
  });

  describe("property", () => {
    it("accepts valid property metadata", () => {
      expect(() => validateMetadata(validProperty)).not.toThrow();
    });

    it.each([
      ["street", "metadata.address.street"],
      ["city", "metadata.address.city"],
      ["state", "metadata.address.state"],
      ["postalCode", "metadata.address.postalCode"],
      ["country", "metadata.address.country"],
    ] as const)("rejects empty %s", (key, field) => {
      const address = { ...validAddress, [key]: "" };
      expectValidationField(() => validateMetadata({ kind: "property", address }), field);
    });

    it.each([
      ["street", "metadata.address.street"],
      ["city", "metadata.address.city"],
      ["state", "metadata.address.state"],
      ["postalCode", "metadata.address.postalCode"],
      ["country", "metadata.address.country"],
    ] as const)("rejects whitespace-only %s", (key, field) => {
      const address = { ...validAddress, [key]: "   " };
      expectValidationField(() => validateMetadata({ kind: "property", address }), field);
    });

    it.each([
      ["street", "metadata.address.street"],
      ["city", "metadata.address.city"],
      ["state", "metadata.address.state"],
      ["postalCode", "metadata.address.postalCode"],
      ["country", "metadata.address.country"],
    ] as const)("rejects absent %s", (key, field) => {
      const address = { ...validAddress, [key]: undefined };
      expectValidationField(() => validateMetadata({ kind: "property", address }), field);
    });
  });

  describe("equipment", () => {
    it("accepts equipment metadata with no required fields", () => {
      expect(() => validateMetadata({ kind: "equipment" })).not.toThrow();
      expect(() => validateMetadata(validEquipment)).not.toThrow();
    });
  });

  it("is reachable for every AssetMetadata kind discriminant", () => {
    const kinds: AssetMetadata[] = [validVehicle, validProperty, validEquipment];
    for (const metadata of kinds) {
      expect(() => validateMetadata(metadata)).not.toThrow();
    }
  });
});
