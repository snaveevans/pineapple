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
import type { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { CreateMaintenanceTask } from "./CreateMaintenanceTask.ts";

class AssetRepositoryFake implements AssetRepository {
  constructor(private readonly asset: Asset | null) {}
  findById(): Promise<Asset | null> {
    return Promise.resolve(this.asset);
  }

  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class TeamRepositoryFake implements TeamRepository {
  constructor(private readonly team: Team | null = null) {}
  findByMember(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }
  findById(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  saved: MaintenanceTask | null = null;
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(null);
  }
  save(task: MaintenanceTask): Promise<void> {
    this.saved = task;
    return Promise.resolve();
  }
  delete(): Promise<void> {
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

const dates: UtcDateProvider = { today: () => "2026-06-11" };

describe("CreateMaintenanceTask", () => {
  const ownerId = UserId.generate();

  function asset(owner = ownerId) {
    return Asset.create({
      ownerId: owner,
      name: "House",
      metadata: { kind: "equipment" },
    });
  }

  async function execute(overrides: Partial<Parameters<CreateMaintenanceTask["execute"]>[0]> = {}) {
    const a = asset();
    const tasks = new MaintenanceTaskRepositoryFake();
    const events = new EventBusFake();
    const result = await new CreateMaintenanceTask(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(),
      tasks,
      events,
      dates,
    ).execute({
      assetId: a.id,
      requesterId: ownerId,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      ...overrides,
    });
    return { result, tasks, events, a };
  }

  it("creates a task, saves it, and publishes MaintenanceTaskCreated", async () => {
    const { result, tasks, events } = await execute();
    expect(result.ok).toBe(true);
    expect(tasks.saved).not.toBeNull();
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceTaskCreated",
        assetName: "House",
        assetType: "equipment",
        title: "Replace furnace filter",
        nextDue: "2026-08-11",
      }),
    ]);
  });

  it("seeds nextDue from today when no lastCompletedDate", async () => {
    const { result } = await execute();
    expect(result.ok && result.value.nextDue).toBe("2026-08-11");
  });

  it("seeds nextDue from lastCompletedDate when provided", async () => {
    const { result } = await execute({ lastCompletedDate: "2026-04-11" });
    expect(result.ok && result.value.nextDue).toBe("2026-06-11");
  });

  it("returns not found when asset does not exist", async () => {
    const tasks = new MaintenanceTaskRepositoryFake();
    const result = await new CreateMaintenanceTask(
      new AssetRepositoryFake(null),
      new TeamRepositoryFake(),
      tasks,
      new EventBusFake(),
      dates,
    ).execute({
      assetId: AssetId.generate(),
      requesterId: ownerId,
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden for another owner's asset", async () => {
    const { result } = await execute({ requesterId: UserId.generate() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("returns conflict for an archived asset", async () => {
    const a = asset();
    a.archivedAt = new Date();
    const tasks = new MaintenanceTaskRepositoryFake();
    const result = await new CreateMaintenanceTask(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(),
      tasks,
      new EventBusFake(),
      dates,
    ).execute({
      assetId: a.id,
      requesterId: ownerId,
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
  });

  it("returns validation error for future lastCompletedDate", async () => {
    const { result } = await execute({ lastCompletedDate: "2026-12-31" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).field).toBe("lastCompletedDate");
    }
  });
});
