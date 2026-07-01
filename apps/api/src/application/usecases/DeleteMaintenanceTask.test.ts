import { describe, expect, it } from "vitest";
import {
  AssetId,
  ForbiddenError,
  MaintenanceTaskId,
  NotFoundError,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { DeleteMaintenanceTask } from "./DeleteMaintenanceTask.ts";

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  deleted: MaintenanceTaskId | null = null;
  constructor(private task: MaintenanceTask | null) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findByOwnerForActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(this.task);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  delete(id: MaintenanceTaskId): Promise<void> {
    this.deleted = id;
    return Promise.resolve();
  }
}

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

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];
  publish(e: DomainEvent): Promise<void> {
    this.events.push(e);
    return Promise.resolve();
  }
  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  subscribe(): void {}
}

describe("DeleteMaintenanceTask", () => {
  const ownerId = UserId.generate();
  const assetId = AssetId.generate();
  const asset = Asset.reconstitute({
    id: assetId,
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    archivedAt: null,
    createdAt: new Date("2026-06-11T12:00:00.000Z"),
    updatedAt: new Date("2026-06-11T12:00:00.000Z"),
  });

  function makeTask(owner = ownerId) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId: owner,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: null,
      nextDue: "2026-08-11",
      createdAt: new Date(),
    });
  }

  it("deletes the task and publishes MaintenanceTaskDeleted", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const events = new EventBusFake();
    const result = await new DeleteMaintenanceTask(
      new AssetRepositoryFake(asset),
      repo,
      events,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(repo.deleted).toBe(task.id);
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceTaskDeleted",
        assetName: "Truck",
        assetType: "vehicle",
        title: "Replace furnace filter",
      }),
    ]);
  });

  it("returns not found when task does not exist", async () => {
    const repo = new MaintenanceTaskRepositoryFake(null);
    const result = await new DeleteMaintenanceTask(
      new AssetRepositoryFake(asset),
      repo,
      new EventBusFake(),
    ).execute({
      taskId: MaintenanceTaskId.generate(),
      assetId,
      requesterId: ownerId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden for another owner's task", async () => {
    const task = makeTask(UserId.generate());
    const repo = new MaintenanceTaskRepositoryFake(task);
    const result = await new DeleteMaintenanceTask(
      new AssetRepositoryFake(asset),
      repo,
      new EventBusFake(),
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("returns not found when task belongs to a different asset", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const result = await new DeleteMaintenanceTask(
      new AssetRepositoryFake(asset),
      repo,
      new EventBusFake(),
    ).execute({
      taskId: task.id,
      assetId: AssetId.generate(),
      requesterId: ownerId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });
});
