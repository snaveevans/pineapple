import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { CreateMaintenanceRecord } from "./CreateMaintenanceRecord.ts";

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
  saved: MaintenanceRecord | null = null;

  findByAsset(): Promise<MaintenanceRecord[]> {
    return Promise.resolve([]);
  }

  save(record: MaintenanceRecord): Promise<void> {
    this.saved = record;
    return Promise.resolve();
  }
}

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }

  subscribe(): void {}
}

const dates: UtcDateProvider = { today: () => "2026-06-09" };

describe("CreateMaintenanceRecord", () => {
  const ownerId = UserId.generate();

  function assetFor(owner = ownerId): Asset {
    return Asset.create({
      ownerId: owner,
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  }

  it("saves a record and publishes MaintenanceRecordCreated", async () => {
    const asset = assetFor();
    const records = new MaintenanceRecordRepositoryFake();
    const events = new EventBusFake();

    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      records,
      events,
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });

    expect(result.ok).toBe(true);
    expect(records.saved).toBe(result.ok ? result.value : null);
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceRecordCreated",
        assetId: asset.id,
        ownerId,
        actorId: ownerId,
      }),
    ]);
    expect(records.saved?.pullEvents()).toEqual([]);
  });

  it("returns not found when the asset does not exist", async () => {
    const result = await executeWithAsset(null, ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden for another owner's asset", async () => {
    const result = await executeWithAsset(assetFor(UserId.generate()), ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("returns conflict for an archived asset", async () => {
    const asset = assetFor();
    asset.archivedAt = new Date("2026-06-08T00:00:00.000Z");

    const result = await executeWithAsset(asset, ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
  });

  it("returns validation error for a future performed date", async () => {
    const asset = assetFor();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new MaintenanceRecordRepositoryFake(),
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-10",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).field).toBe("performedAt");
    }
  });

  it("normalizes blank notes to null before persistence and response", async () => {
    const asset = assetFor();
    const records = new MaintenanceRecordRepositoryFake();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      records,
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
      notes: "   ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.notes).toBeNull();
    expect(records.saved?.notes).toBeNull();
  });

  it("returns an invariant error for a malformed UTC date provider value", async () => {
    const asset = assetFor();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new MaintenanceRecordRepositoryFake(),
      new EventBusFake(),
      { today: () => "not-a-date" },
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe("InvariantError");
      expect("field" in result.error).toBe(false);
    }
  });

  function executeWithAsset(asset: Asset | null, requesterId: UserId) {
    return new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new MaintenanceRecordRepositoryFake(),
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset?.id ?? AssetId.generate(),
      requesterId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });
  }
});
