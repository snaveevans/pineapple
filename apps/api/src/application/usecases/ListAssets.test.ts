import { describe, expect, it } from "vitest";
import { AssetId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { ListAssets } from "./ListAssets.ts";

class AssetRepositoryFake implements AssetRepository {
  requestedUserId: UserId | null = null;

  constructor(private readonly assets: Asset[]) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findByOwner(ownerId: UserId): Promise<Asset[]> {
    return Promise.resolve(this.assets.filter((asset) => asset.ownerId === ownerId));
  }

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    this.requestedUserId = userId;
    return Promise.resolve(this.assets.filter((asset) => asset.ownerId === userId));
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class UserRepositoryFake implements UserRepository {
  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(): Promise<User[]> {
    return Promise.resolve([]);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
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

    const result = await new ListAssets(repository, new UserRepositoryFake()).execute({
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assets.map((item) => item.asset)).toEqual([vehicle, equipment, property]);
    expect(result.value.assets.every((item) => item.sharing.isOwner)).toBe(true);
    expect(result.value.counts).toEqual({ all: 3, vehicle: 1, equipment: 1, property: 1 });
    expect(repository.requestedUserId).toBe(ownerId);
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

    const result = await new ListAssets(
      new AssetRepositoryFake([archived]),
      new UserRepositoryFake(),
    ).execute({ requesterId: ownerId });

    expect(result).toEqual({
      ok: true,
      value: {
        assets: [],
        counts: { all: 0, vehicle: 0, equipment: 0, property: 0 },
      },
    });
  });
});
