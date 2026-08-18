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
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { UpdateMaintenanceTask } from "./UpdateMaintenanceTask.ts";

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
  savedEvents: readonly DomainEvent[] = [];
  constructor(private task: MaintenanceTask | null) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(this.task);
  }
  save(task: MaintenanceTask, events: readonly DomainEvent[] = []): Promise<void> {
    this.saved = task;
    this.savedEvents = events;
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

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

describe("UpdateMaintenanceTask", () => {
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

  function makeTask(overrides: Partial<Parameters<typeof MaintenanceTask.reconstitute>[0]> = {}) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-04-11",
      nextDue: "2026-06-11",
      createdAt: new Date(),
      ...overrides,
    });
  }

  it("updates title and publishes MaintenanceTaskUpdated", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const events = new EventBusFake();

    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      title: "Replace filter",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe("Replace filter");
    expect(repo.saved?.title).toBe("Replace filter");
    expect(events.events).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskUpdated", title: "Replace filter" }),
    ]);
  });

  it("recomputes nextDue when intervalValue changes", async () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    const repo = new MaintenanceTaskRepositoryFake(task);
    const events = new EventBusFake();

    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      intervalValue: 3,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nextDue).toBe("2026-07-11");
    expect(events.events).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskUpdated", nextDue: "2026-07-11" }),
    ]);
  });

  it("does not save or publish when the edit is a no-op", async () => {
    const task = makeTask({ intervalValue: 2, intervalUnit: "month" });
    const repo = new MaintenanceTaskRepositoryFake(task);
    const events = new EventBusFake();

    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
    });

    expect(result.ok).toBe(true);
    expect(repo.saved).toBeNull();
    expect(events.events).toHaveLength(0);
  });

  it("returns not found when the task does not exist", async () => {
    const repo = new MaintenanceTaskRepositoryFake(null);
    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      new EventBusFake(),
      dates,
    ).execute({
      taskId: MaintenanceTaskId.generate(),
      assetId,
      requesterId: ownerId,
      title: "New title",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns not found when the task belongs to a different asset", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      new EventBusFake(),
      dates,
    ).execute({
      taskId: task.id,
      assetId: AssetId.generate(),
      requesterId: ownerId,
      title: "New title",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden when the requester cannot access the parent asset", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      new EventBusFake(),
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: UserId.generate(),
      title: "New title",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("allows a non-owner team member to edit a task on a shared asset", async () => {
    const memberId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    const sharedAsset = Asset.reconstitute({
      id: assetId,
      ownerId,
      name: asset.name,
      metadata: asset.metadata,
      archivedAt: null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      sharedTeamId: team.id,
    });
    const memberTeam = Team.reconstitute({
      id: team.id,
      ownerId: team.ownerId,
      name: team.name,
      createdAt: team.createdAt,
      members: [
        ...team.members,
        createMembership({ userId: memberId, role: "member", joinedAt: new Date() }),
      ],
    });
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);
    const events = new EventBusFake();

    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(sharedAsset),
      new TeamRepositoryFake(memberTeam),
      repo,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: memberId,
      title: "New title",
    });

    expect(result.ok).toBe(true);
    expect(events.events).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskUpdated", actorId: memberId }),
    ]);
  });

  it("permits editing a task on an archived asset", async () => {
    const archivedAsset = Asset.reconstitute({
      id: assetId,
      ownerId,
      name: asset.name,
      metadata: asset.metadata,
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake(task);

    const result = await new UpdateMaintenanceTask(
      new AssetRepositoryFake(archivedAsset),
      new TeamRepositoryFake(),
      repo,
      new EventBusFake(),
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      title: "New title",
    });

    expect(result.ok).toBe(true);
  });
});
