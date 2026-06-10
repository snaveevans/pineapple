import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import { ListMaintenanceRecords } from "./ListMaintenanceRecords.ts";

class AssetRepositoryFake implements AssetRepository {
  constructor(private readonly asset: Asset | null) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(this.asset);
  }

  findByOwner(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class MaintenanceRecordRepositoryFake implements MaintenanceRecordRepository {
  requestedOwnerId: string | null = null;

  constructor(private readonly records: MaintenanceRecord[]) {}

  findByAsset(_assetId: string, ownerId: string): Promise<MaintenanceRecord[]> {
    this.requestedOwnerId = ownerId;
    return Promise.resolve(this.records);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("ListMaintenanceRecords", () => {
  const ownerId = UserId.generate();

  it("returns archived asset history newest first and filters by requester", async () => {
    const asset = assetFor();
    asset.archivedAt = new Date("2026-06-08T00:00:00.000Z");
    const older = record(asset, "2026-05-01", "2026-06-01T00:00:00.000Z");
    const sameDateOlder = record(asset, "2026-06-01", "2026-06-01T00:00:00.000Z");
    const sameDateNewer = record(asset, "2026-06-01", "2026-06-02T00:00:00.000Z");
    const repositoryOrder = [sameDateNewer, sameDateOlder, older];
    const records = new MaintenanceRecordRepositoryFake(repositoryOrder);

    const result = await new ListMaintenanceRecords(
      new AssetRepositoryFake(asset),
      records,
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(repositoryOrder);
    expect(records.requestedOwnerId).toBe(ownerId);
  });

  it("returns not found when the asset does not exist", async () => {
    const assetId = assetFor().id;
    const result = await new ListMaintenanceRecords(
      new AssetRepositoryFake(null),
      new MaintenanceRecordRepositoryFake([]),
    ).execute({ assetId, requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden for another owner's asset", async () => {
    const asset = assetFor();
    expect(asset.archivedAt).toBeNull();

    const result = await new ListMaintenanceRecords(
      new AssetRepositoryFake(asset),
      new MaintenanceRecordRepositoryFake([]),
    ).execute({ assetId: asset.id, requesterId: UserId.generate() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  function assetFor(): Asset {
    return Asset.create({
      ownerId,
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  }

  function record(asset: Asset, performedAt: string, createdAt: string): MaintenanceRecord {
    const created = MaintenanceRecord.create({
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      title: "Maintenance",
      performedAt,
      todayUtc: "2026-06-09",
    });
    return MaintenanceRecord.reconstitute({
      id: created.id,
      assetId: created.assetId,
      ownerId: created.ownerId,
      title: created.title,
      performedAt: created.performedAt,
      notes: created.notes,
      createdAt: new Date(createdAt),
    });
  }
});
