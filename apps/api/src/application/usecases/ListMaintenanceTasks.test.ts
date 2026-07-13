import { describe, expect, it } from "vitest";
import {
  AssetId,
  ForbiddenError,
  MaintenanceTaskId,
  NotFoundError,
  UserId,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import { ListMaintenanceTasks } from "./ListMaintenanceTasks.ts";

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
  constructor(private readonly tasks: MaintenanceTask[] = []) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks);
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
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

describe("ListMaintenanceTasks", () => {
  const ownerId = UserId.generate();

  function asset(owner = ownerId) {
    return Asset.create({ ownerId: owner, name: "House", metadata: { kind: "equipment" } });
  }

  function makeTask(assetId: AssetId) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: null,
      nextDue: "2026-08-11",
      createdAt: new Date(),
    });
  }

  it("returns the asset's tasks", async () => {
    const a = asset();
    const task = makeTask(a.id);
    const result = await new ListMaintenanceTasks(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(),
      new MaintenanceTaskRepositoryFake([task]),
    ).execute({ assetId: a.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([task]);
  });

  it("returns an empty array when the asset has no tasks", async () => {
    const a = asset();
    const result = await new ListMaintenanceTasks(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(),
      new MaintenanceTaskRepositoryFake([]),
    ).execute({ assetId: a.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns not found when the asset does not exist", async () => {
    const result = await new ListMaintenanceTasks(
      new AssetRepositoryFake(null),
      new TeamRepositoryFake(),
      new MaintenanceTaskRepositoryFake(),
    ).execute({ assetId: AssetId.generate(), requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden when the asset belongs to another user", async () => {
    const a = asset(UserId.generate());
    const result = await new ListMaintenanceTasks(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(),
      new MaintenanceTaskRepositoryFake(),
    ).execute({ assetId: a.id, requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("allows a non-owner team member to list tasks on a shared asset", async () => {
    const memberId = UserId.generate();
    const a = asset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    a.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    a.pullEvents();
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
    const task = makeTask(a.id);

    const result = await new ListMaintenanceTasks(
      new AssetRepositoryFake(a),
      new TeamRepositoryFake(memberTeam),
      new MaintenanceTaskRepositoryFake([task]),
    ).execute({ assetId: a.id, requesterId: memberId });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([task]);
  });
});
