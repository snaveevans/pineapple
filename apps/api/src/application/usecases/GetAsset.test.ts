import { describe, expect, it } from "vitest";
import { UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { GetAsset } from "./GetAsset.ts";

class SingleAssetRepository implements AssetRepository {
  constructor(private readonly asset: Asset) {}

  findById(): Promise<Asset> {
    return Promise.resolve(this.asset);
  }

  findByOwner(): Promise<Asset[]> {
    return Promise.resolve([this.asset]);
  }

  countActiveByOwner(): Promise<number> {
    return Promise.resolve(1);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetAsset", () => {
  it("returns not found when the asset belongs to a different user", async () => {
    const asset = Asset.create({
      ownerId: UserId.generate(),
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });

    const result = await new GetAsset(new SingleAssetRepository(asset)).execute({
      assetId: asset.id,
      requesterId: UserId.generate(),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Asset not found" },
    });
  });
});
