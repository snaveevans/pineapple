import { describe, it, expect } from "vitest";
import { TeamId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { Asset } from "./Asset";

function expectValidationField(run: () => void, field: string): void {
  try {
    run();
    expect.fail("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe(field);
  }
}

describe("Asset", () => {
  const ownerId = UserId.generate();
  const validVehicle = { kind: "vehicle" as const, make: "Ram", model: "2500", year: 2016 };
  const validProperty = {
    kind: "property" as const,
    address: {
      street: "123 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    },
  };
  const validEquipment = { kind: "equipment" as const, manufacturer: "Honda" };

  it("creates a vehicle asset and emits AssetCreated", () => {
    const asset = Asset.create({ ownerId, name: "My Truck", metadata: validVehicle });

    expect(asset.name).toBe("My Truck");
    expect(asset.type).toBe("vehicle");
    expect(asset.ownerId).toBe(ownerId);
    expect(asset.sharedTeamId).toBeNull();
    expect(asset.isShared).toBe(false);
    expect(asset.archivedAt).toBeNull();
    expect(asset.metadata).toEqual(validVehicle);

    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("AssetCreated");
    expect(events[0]).toMatchObject({
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      assetName: "My Truck",
      assetType: "vehicle",
      assetModelYear: 2016,
    });

    // Second pull returns empty — events are drained
    expect(asset.pullEvents()).toHaveLength(0);
  });

  it("creates a property asset without assetModelYear on AssetCreated", () => {
    const asset = Asset.create({ ownerId, name: "Cabin", metadata: validProperty });

    expect(asset.type).toBe("property");
    expect(asset.metadata).toEqual(validProperty);

    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "AssetCreated",
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      assetName: "Cabin",
      assetType: "property",
    });
    expect(events[0]).not.toHaveProperty("assetModelYear");
  });

  it("creates an equipment asset without assetModelYear on AssetCreated", () => {
    const asset = Asset.create({ ownerId, name: "Generator", metadata: validEquipment });

    expect(asset.type).toBe("equipment");
    const events = asset.pullEvents();
    expect(events[0]).toMatchObject({
      type: "AssetCreated",
      assetType: "equipment",
      assetName: "Generator",
    });
    expect(events[0]).not.toHaveProperty("assetModelYear");
  });

  it("trims whitespace from name", () => {
    const asset = Asset.create({ ownerId, name: "  My Truck  ", metadata: validVehicle });
    expect(asset.name).toBe("My Truck");
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
    ["absent", undefined],
  ] as const)("rejects %s name with field name", (_label, name) => {
    expectValidationField(
      () =>
        Asset.create({
          ownerId,
          name: name as string,
          metadata: validVehicle,
        }),
      "name",
    );
  });

  it("rejects invalid vehicle metadata via create", () => {
    expectValidationField(
      () =>
        Asset.create({
          ownerId,
          name: "Old Truck",
          metadata: { ...validVehicle, year: 1899 },
        }),
      "metadata.year",
    );
  });

  it("rejects VIN that is not 17 characters", () => {
    expectValidationField(
      () =>
        Asset.create({
          ownerId,
          name: "Truck",
          metadata: { ...validVehicle, vin: "TOOSHORT" },
        }),
      "metadata.vin",
    );
  });

  it("edit trims the name and rejects blank names", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();

    asset.edit({ name: "  New Name  ", metadata: validVehicle, actorId: ownerId });
    expect(asset.name).toBe("New Name");

    expectValidationField(
      () => asset.edit({ name: "", metadata: validVehicle, actorId: ownerId }),
      "name",
    );
    expectValidationField(
      () => asset.edit({ name: "   ", metadata: validVehicle, actorId: ownerId }),
      "name",
    );
  });

  it("edit updates name and metadata together and emits exactly one AssetEdited event", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();

    const nextMetadata = { ...validVehicle, model: "3500" };
    asset.edit({ name: "New Name", metadata: nextMetadata, actorId: ownerId });

    expect(asset.name).toBe("New Name");
    expect(asset.metadata).toEqual(nextMetadata);

    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "AssetEdited",
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      assetName: "New Name",
      previousName: "Truck",
      assetType: "vehicle",
      nameChanged: true,
      metadataChanged: true,
    });
  });

  it("edit rejects a metadata kind that differs from the asset's current kind", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();

    expectValidationField(
      () => asset.edit({ name: "Truck", metadata: validProperty, actorId: ownerId }),
      "metadata.kind",
    );
    expect(asset.pullEvents()).toHaveLength(0);
  });

  it("edit with no actual changes succeeds and emits no event", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();

    asset.edit({ name: "Truck", metadata: validVehicle, actorId: ownerId });

    expect(asset.name).toBe("Truck");
    expect(asset.pullEvents()).toHaveLength(0);
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
      sharedTeamId: null,
    });

    expect(reconstituted.pullEvents()).toHaveLength(0);
    expect(reconstituted.name).toBe("Truck");
    expect(reconstituted.sharedTeamId).toBeNull();
  });

  it("shares to a team and emits AssetSharedToTeam", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();
    const teamId = TeamId.generate();

    asset.shareToTeam({ teamId, teamName: "Field Ops", actorId: ownerId });

    expect(asset.sharedTeamId).toBe(teamId);
    expect(asset.isShared).toBe(true);
    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "AssetSharedToTeam",
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      assetName: "Truck",
      teamId,
      teamName: "Field Ops",
    });
  });

  it("shareToTeam is idempotent for the same team", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();
    const teamId = TeamId.generate();

    asset.shareToTeam({ teamId, teamName: "Field Ops", actorId: ownerId });
    asset.pullEvents();
    asset.shareToTeam({ teamId, teamName: "Field Ops", actorId: ownerId });

    expect(asset.sharedTeamId).toBe(teamId);
    expect(asset.pullEvents()).toHaveLength(0);
  });

  it("unshares and emits AssetUnsharedFromTeam", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();
    const teamId = TeamId.generate();
    asset.shareToTeam({ teamId, teamName: "Field Ops", actorId: ownerId });
    asset.pullEvents();

    asset.unshare({ actorId: ownerId, teamId, teamName: "Field Ops" });

    expect(asset.sharedTeamId).toBeNull();
    expect(asset.isShared).toBe(false);
    const events = asset.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "AssetUnsharedFromTeam",
      assetId: asset.id,
      teamId,
      teamName: "Field Ops",
      assetName: "Truck",
    });
  });

  it("unshare is idempotent when already personal", () => {
    const asset = Asset.create({ ownerId, name: "Truck", metadata: validVehicle });
    asset.pullEvents();

    asset.unshare({
      actorId: ownerId,
      teamId: TeamId.generate(),
      teamName: "Field Ops",
    });

    expect(asset.sharedTeamId).toBeNull();
    expect(asset.pullEvents()).toHaveLength(0);
  });
});
