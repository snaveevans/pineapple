import { describe, expect, it } from "vitest";
import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { GetDashboard } from "./GetDashboard.ts";

class FixedDateProvider implements UtcDateProvider {
  constructor(private readonly todayUtc: string) {}
  today(): string {
    return this.todayUtc;
  }
}

class AssetRepositoryFake implements AssetRepository {
  constructor(private readonly assets: Asset[]) {}
  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }
  findByOwner(): Promise<Asset[]> {
    return Promise.resolve(this.assets);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  constructor(private readonly tasks: MaintenanceTask[] = []) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findByOwnerForActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks);
  }
  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetDashboard", () => {
  const ownerId = UserId.generate();
  const todayUtc = "2026-06-16";

  function vehicle(name = "Truck") {
    return Asset.create({
      ownerId,
      name,
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });
  }

  function equipment(name = "Mower") {
    return Asset.create({
      ownerId,
      name,
      metadata: { kind: "equipment" },
    });
  }

  function task(
    assetId: AssetId,
    props: {
      title: string;
      nextDue: string;
      createdAt?: Date;
      lastCompletedDate?: string | null;
    },
  ) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId,
      title: props.title,
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: props.lastCompletedDate ?? null,
      nextDue: props.nextDue,
      createdAt: props.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  it("returns empty dashboard state when the owner has no active assets", async () => {
    const result = await new GetDashboard(
      new AssetRepositoryFake([]),
      new MaintenanceTaskRepositoryFake([]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      viewerDisplayName: "Dale",
      todayUtc,
      fleetTotals: { total: 0, vehicle: 0, equipment: 0, property: 0 },
      fleetHealth: { overdue: 0, soon: 0, onTrack: 0, unscheduled: 0 },
      queueCountsByCategory: { all: 0, vehicle: 0, equipment: 0, property: 0 },
      queue: [],
    });
  });

  it("counts unscheduled assets separately from on-track assets", async () => {
    const truck = vehicle();
    const mower = equipment();
    const result = await new GetDashboard(
      new AssetRepositoryFake([truck, mower]),
      new MaintenanceTaskRepositoryFake([
        task(truck.id, { title: "Oil change", nextDue: "2026-08-01" }),
      ]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetTotals.total).toBe(2);
    expect(result.value.fleetHealth).toEqual({
      overdue: 0,
      soon: 0,
      onTrack: 1,
      unscheduled: 1,
    });
  });

  it("uses the most urgent task per asset for fleet health counts", async () => {
    const truck = vehicle();
    const result = await new GetDashboard(
      new AssetRepositoryFake([truck]),
      new MaintenanceTaskRepositoryFake([
        task(truck.id, { title: "Annual inspection", nextDue: "2026-08-01" }),
        task(truck.id, { title: "Oil change", nextDue: "2026-06-10" }),
      ]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetHealth).toEqual({
      overdue: 1,
      soon: 0,
      onTrack: 0,
      unscheduled: 0,
    });
  });

  it("sorts queue items by urgency, nextDue, then createdAt", async () => {
    const truck = vehicle();
    const mower = equipment();
    const result = await new GetDashboard(
      new AssetRepositoryFake([truck, mower]),
      new MaintenanceTaskRepositoryFake([
        task(mower.id, {
          title: "Blade sharpen",
          nextDue: "2026-06-20",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        }),
        task(truck.id, {
          title: "Oil change",
          nextDue: "2026-06-10",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        task(truck.id, {
          title: "Tire rotation",
          nextDue: "2026-06-10",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
        }),
      ]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue.map((item) => item.taskTitle)).toEqual([
      "Oil change",
      "Tire rotation",
      "Blade sharpen",
    ]);
    expect(result.value.queue[0]?.status).toBe("overdue");
    expect(result.value.queue[0]?.daysDue).toBe(-6);
    expect(result.value.queue[2]?.status).toBe("soon");
    expect(result.value.queue[2]?.daysDue).toBe(4);
    expect(result.value.queueCountsByCategory).toEqual({
      all: 3,
      vehicle: 2,
      equipment: 1,
      property: 0,
    });
  });

  it("omits tasks whose asset is absent from the active asset snapshot", async () => {
    const truck = vehicle("Active truck");
    const archived = Asset.reconstitute({
      id: AssetId.generate(),
      ownerId,
      name: "Archived truck",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2019 },
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    const result = await new GetDashboard(
      new AssetRepositoryFake([truck, archived]),
      new MaintenanceTaskRepositoryFake([
        task(truck.id, { title: "Active task", nextDue: "2026-06-20" }),
        task(archived.id, { title: "Orphan task", nextDue: "2026-06-10" }),
      ]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue).toHaveLength(1);
    expect(result.value.queue[0]?.taskTitle).toBe("Active task");
  });

  it("excludes archived assets from totals and queue", async () => {
    const active = vehicle("Active truck");
    const archived = Asset.reconstitute({
      id: AssetId.generate(),
      ownerId,
      name: "Archived truck",
      metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2019 },
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    const result = await new GetDashboard(
      new AssetRepositoryFake([active, archived]),
      // findByOwnerForActiveAssets omits archived-asset tasks; see D1MaintenanceTaskRepository.test.ts
      new MaintenanceTaskRepositoryFake([
        task(active.id, { title: "Oil change", nextDue: "2026-06-20" }),
      ]),
      new FixedDateProvider(todayUtc),
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetTotals.total).toBe(1);
    expect(result.value.queue).toHaveLength(1);
    expect(result.value.queue[0]?.assetName).toBe("Active truck");
  });
});
