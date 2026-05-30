import { describe, it, expect } from "vitest";
import { UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { Asset } from "./Asset";

describe("Asset", () => {
  const ownerId = UserId.generate();
  const validVehicle = { kind: "vehicle" as const, make: "Ram", model: "2500", year: 2016 };

  it("creates a vehicle asset and emits AssetCreated", () => {
    const asset = Asset.create({ ownerId, name: "My Truck", metadata: validVehicle });

    expect(asset.name).toBe("My Truck");
    expect(asset.type).toBe("vehicle");
    expect(asset.ownerId).toBe(ownerId);

    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("AssetCreated");
    expect(events[0]).toMatchObject({ assetType: "vehicle", assetModelYear: 2016 });

    // Second pull returns empty — events are drained
    expect(asset.pullEvents()).toHaveLength(0);
  });

  it("trims whitespace from name", () => {
    const asset = Asset.create({ ownerId, name: "  My Truck  ", metadata: validVehicle });
    expect(asset.name).toBe("My Truck");
  });

  it("rejects blank name", () => {
    expect(() => Asset.create({ ownerId, name: "   ", metadata: validVehicle })).toThrow(
      ValidationError,
    );
  });

  it("rejects invalid vehicle year", () => {
    expect(() =>
      Asset.create({ ownerId, name: "Old Truck", metadata: { ...validVehicle, year: 1800 } }),
    ).toThrow(ValidationError);
  });

  it("rejects VIN that is not 17 characters", () => {
    expect(() =>
      Asset.create({
        ownerId,
        name: "Truck",
        metadata: { ...validVehicle, vin: "TOOSHORT" },
      }),
    ).toThrow(ValidationError);
  });

  it("reconstitutes without emitting events", () => {
    const original = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    original.pullEvents(); // drain

    const reconstituted = Asset.reconstitute({
      id: original.id,
      ownerId: original.ownerId,
      name: original.name,
      metadata: original.metadata,
      archivedAt: null,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
    });

    expect(reconstituted.pullEvents()).toHaveLength(0);
    expect(reconstituted.name).toBe("Truck");
  });
});
