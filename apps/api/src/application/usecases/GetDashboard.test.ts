import { describe, expect, it } from "vitest";
import { AssetId, Email, MaintenanceTaskId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
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

  findVisibleTo(): Promise<Asset[]> {
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
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
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

class UserRepositoryFake implements UserRepository {
  constructor(private readonly users: User[] = []) {}

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    return Promise.resolve(this.users.filter((user) => ids.includes(user.id)));
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetDashboard", () => {
  const ownerId = UserId.generate();
  const teammateId = UserId.generate();
  const teamId = TeamId.generate();
  const todayUtc = "2026-06-16";

  function vehicle(name = "Truck", props?: { ownerId?: UserId; sharedTeamId?: TeamId | null }) {
    return Asset.reconstitute({
      id: AssetId.generate(),
      ownerId: props?.ownerId ?? ownerId,
      name,
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      archivedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sharedTeamId: props?.sharedTeamId ?? null,
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
      ownerId?: UserId;
    },
  ) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId: props.ownerId ?? ownerId,
      title: props.title,
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: props.lastCompletedDate ?? null,
      nextDue: props.nextDue,
      createdAt: props.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  function dashboard(assets: Asset[], tasks: MaintenanceTask[], users: User[] = []): GetDashboard {
    return new GetDashboard(
      new AssetRepositoryFake(assets),
      new MaintenanceTaskRepositoryFake(tasks),
      new FixedDateProvider(todayUtc),
      new UserRepositoryFake(users),
    );
  }

  it("returns empty dashboard state when the owner has no active assets", async () => {
    const result = await dashboard([], []).execute({ ownerId, viewerDisplayName: "Dale" });

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
    const result = await dashboard(
      [truck, mower],
      [task(truck.id, { title: "Oil change", nextDue: "2026-08-01" })],
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
    const result = await dashboard(
      [truck],
      [
        task(truck.id, { title: "Annual inspection", nextDue: "2026-08-01" }),
        task(truck.id, { title: "Oil change", nextDue: "2026-06-10" }),
      ],
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
    const result = await dashboard(
      [truck, mower],
      [
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
      ],
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
    const result = await dashboard(
      [truck, archived],
      [
        task(truck.id, { title: "Active task", nextDue: "2026-06-20" }),
        task(archived.id, { title: "Orphan task", nextDue: "2026-06-10" }),
      ],
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
    const result = await dashboard(
      [active, archived],
      // findForVisibleActiveAssets omits archived-asset tasks; see D1MaintenanceTaskRepository.test.ts
      [task(active.id, { title: "Oil change", nextDue: "2026-06-20" })],
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetTotals.total).toBe(1);
    expect(result.value.queue).toHaveLength(1);
    expect(result.value.queue[0]?.assetName).toBe("Active truck");
  });

  it("attaches personal sharing on owned personal assets", async () => {
    const truck = vehicle("Personal truck");
    const result = await dashboard(
      [truck],
      [task(truck.id, { title: "Oil change", nextDue: "2026-06-20" })],
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });

  it("attaches team sharing without ownerDisplayName when the caller owns a shared asset", async () => {
    const truck = vehicle("Shared truck", { sharedTeamId: teamId });
    const result = await dashboard(
      [truck],
      [task(truck.id, { title: "Oil change", nextDue: "2026-06-20" })],
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "team",
      isOwner: true,
    });
  });

  it("attaches team sharing with ownerDisplayName when the asset is shared with the caller", async () => {
    const shared = vehicle("Teammate truck", { ownerId: teammateId, sharedTeamId: teamId });
    const teammate = User.reconstitute({
      id: teammateId,
      email: Email.from("teammate@example.com"),
      name: "Pat",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = await dashboard(
      [shared],
      [
        task(shared.id, {
          title: "Oil change",
          nextDue: "2026-06-20",
          ownerId: teammateId,
        }),
      ],
      [teammate],
    ).execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });
});
