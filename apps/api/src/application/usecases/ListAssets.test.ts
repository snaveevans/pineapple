import { describe, expect, it } from "vitest";
import { AssetId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { ListAssets } from "./ListAssets.ts";

class AssetRepositoryFake implements AssetRepository {
  requestedOwnerId: UserId | null = null;

  constructor(private readonly assets: Asset[]) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findByOwner(ownerId: UserId): Promise<Asset[]> {
    this.requestedOwnerId = ownerId;
    return Promise.resolve(this.assets.filter((asset) => asset.ownerId === ownerId));
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("ListAssets", () => {
  const ownerId = UserId.generate();

  it("returns active owner assets with counts from the same set", async () => {
    const vehicle = Asset.create({
      ownerId,
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });
    const equipment = Asset.create({
      ownerId,
      name: "Generator",
      metadata: { kind: "equipment" },
    });
    const property = Asset.create({
      ownerId,
      name: "Cabin",
      metadata: {
        kind: "property",
        address: {
          street: "123 Main St",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          country: "US",
        },
      },
    });
    const archived = Asset.reconstitute({
      id: AssetId.generate(),
      ownerId,
      name: "Archived mower",
      metadata: { kind: "equipment" },
      archivedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const otherOwnerAsset = Asset.create({
      ownerId: UserId.generate(),
      name: "Other truck",
      metadata: { kind: "vehicle", make: "Ford", model: "Ranger", year: 2020 },
    });
    const repository = new AssetRepositoryFake([
      vehicle,
      equipment,
      property,
      archived,
      otherOwnerAsset,
    ]);

    const result = await new ListAssets(repository).execute({ ownerId });

    expect(result).toEqual({
      ok: true,
      value: {
        assets: [vehicle, equipment, property],
        counts: { all: 3, vehicle: 1, equipment: 1, property: 1 },
      },
    });
    expect(repository.requestedOwnerId).toBe(ownerId);
  });

  it("returns zero counts when the owner has no active assets", async () => {
    const archived = Asset.reconstitute({
      id: AssetId.generate(),
      ownerId,
      name: "Archived truck",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2020 },
      archivedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const result = await new ListAssets(new AssetRepositoryFake([archived])).execute({ ownerId });

    expect(result).toEqual({
      ok: true,
      value: {
        assets: [],
        counts: { all: 0, vehicle: 0, equipment: 0, property: 0 },
      },
    });
  });
});
