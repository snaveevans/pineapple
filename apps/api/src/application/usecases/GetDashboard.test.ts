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
  findByIdsCalls: UserId[][] = [];

  constructor(private readonly users: User[] = []) {}

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    this.findByIdsCalls.push([...ids]);
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
  const otherTeammateId = UserId.generate();
  const teamId = TeamId.generate();
  const todayUtc = "2026-06-16";

  function vehicle(
    name = "Truck",
    props?: { ownerId?: UserId; sharedTeamId?: TeamId | null; archivedAt?: Date | null },
  ) {
    return Asset.reconstitute({
      id: AssetId.generate(),
      ownerId: props?.ownerId ?? ownerId,
      name,
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      archivedAt: props?.archivedAt ?? null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sharedTeamId: props?.sharedTeamId ?? null,
    });
  }

  function equipment(name = "Mower", props?: { ownerId?: UserId; sharedTeamId?: TeamId | null }) {
    return Asset.reconstitute({
      id: AssetId.generate(),
      ownerId: props?.ownerId ?? ownerId,
      name,
      metadata: { kind: "equipment" },
      archivedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sharedTeamId: props?.sharedTeamId ?? null,
    });
  }

  function property(name = "Cabin") {
    return Asset.reconstitute({
      id: AssetId.generate(),
      ownerId,
      name,
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
      archivedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sharedTeamId: null,
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
      intervalValue?: number;
      intervalUnit?: "day" | "week" | "month" | "year";
    },
  ) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId: props.ownerId ?? ownerId,
      title: props.title,
      intervalValue: props.intervalValue ?? 1,
      intervalUnit: props.intervalUnit ?? "month",
      lastCompletedDate: props.lastCompletedDate ?? null,
      nextDue: props.nextDue,
      createdAt: props.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  function user(id: UserId, name: string | null, email = "user@example.com"): User {
    return User.reconstitute({
      id,
      email: Email.from(email),
      name,
      onboardingCompletedAt: name === null ? null : new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  function dashboard(
    assets: Asset[],
    tasks: MaintenanceTask[],
    users: User[] = [],
  ): { useCase: GetDashboard; users: UserRepositoryFake } {
    const usersFake = new UserRepositoryFake(users);
    return {
      useCase: new GetDashboard(
        new AssetRepositoryFake(assets),
        new MaintenanceTaskRepositoryFake(tasks),
        new FixedDateProvider(todayUtc),
        usersFake,
      ),
      users: usersFake,
    };
  }

  it("returns empty dashboard state when the owner has no active assets", async () => {
    const { useCase, users } = dashboard([], []);
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

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
    expect(users.findByIdsCalls).toEqual([]);
  });

  it("asserts exact per-type fleet totals and multi-bucket fleet health", async () => {
    const overdueVehicle = vehicle("Overdue truck");
    const soonVehicle = vehicle("Soon truck");
    const onTrackEquipment = equipment("On-track mower");
    const unscheduledProperty = property("Cabin");
    const secondUnscheduled = equipment("Spare generator");

    const { useCase } = dashboard(
      [overdueVehicle, soonVehicle, onTrackEquipment, unscheduledProperty, secondUnscheduled],
      [
        task(overdueVehicle.id, { title: "Oil change", nextDue: "2026-06-10" }),
        task(soonVehicle.id, { title: "Tire rotation", nextDue: "2026-06-20" }),
        task(onTrackEquipment.id, { title: "Blade sharpen", nextDue: "2026-08-01" }),
      ],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Exact counts kill totals[type]++ → -- and health bucket ++ → --
    expect(result.value.fleetTotals).toEqual({
      total: 5,
      vehicle: 2,
      equipment: 2,
      property: 1,
    });
    expect(result.value.fleetHealth).toEqual({
      overdue: 1,
      soon: 1,
      onTrack: 1,
      unscheduled: 2,
    });
    expect(result.value.queueCountsByCategory).toEqual({
      all: 3,
      vehicle: 2,
      equipment: 1,
      property: 0,
    });
  });

  it("counts unscheduled assets separately from on-track assets", async () => {
    const truck = vehicle();
    const mower = equipment();
    const { useCase } = dashboard(
      [truck, mower],
      [task(truck.id, { title: "Oil change", nextDue: "2026-08-01" })],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetTotals).toEqual({
      total: 2,
      vehicle: 1,
      equipment: 1,
      property: 0,
    });
    expect(result.value.fleetHealth).toEqual({
      overdue: 0,
      soon: 0,
      onTrack: 1,
      unscheduled: 1,
    });
  });

  it("uses the most urgent task per asset for fleet health counts", async () => {
    const truck = vehicle();
    const { useCase } = dashboard(
      [truck],
      [
        task(truck.id, { title: "Annual inspection", nextDue: "2026-08-01" }),
        task(truck.id, { title: "Oil change", nextDue: "2026-06-10" }),
      ],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetHealth).toEqual({
      overdue: 1,
      soon: 0,
      onTrack: 0,
      unscheduled: 0,
    });
    // Both tasks still appear in the queue with exact order and fields
    expect(result.value.queue.map((item) => item.taskTitle)).toEqual([
      "Oil change",
      "Annual inspection",
    ]);
    expect(result.value.queue[0]).toMatchObject({
      status: "overdue",
      daysDue: -6,
      assetId: truck.id,
      assetName: "Truck",
      assetType: "vehicle",
    });
    expect(result.value.queue[1]).toMatchObject({
      status: "ok",
      daysDue: 46,
      assetType: "vehicle",
    });
  });

  it("sorts queue items by urgency, nextDue, then createdAt", async () => {
    const truck = vehicle();
    const mower = equipment();
    const cabin = property();
    const { useCase } = dashboard(
      [truck, mower, cabin],
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
          lastCompletedDate: "2026-05-10",
          intervalValue: 3,
          intervalUnit: "month",
        }),
        task(truck.id, {
          title: "Tire rotation",
          nextDue: "2026-06-10",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
        }),
        task(cabin.id, {
          title: "Gutter clean",
          nextDue: "2026-06-20",
          createdAt: new Date("2026-01-15T00:00:00.000Z"),
        }),
        task(mower.id, {
          title: "Belt check",
          nextDue: "2026-09-01",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Pin full order: overdue by createdAt, soon by nextDue then createdAt, then ok
    expect(result.value.queue.map((item) => item.taskTitle)).toEqual([
      "Oil change",
      "Tire rotation",
      "Gutter clean",
      "Blade sharpen",
      "Belt check",
    ]);
    expect(result.value.queue.map((item) => item.status)).toEqual([
      "overdue",
      "overdue",
      "soon",
      "soon",
      "ok",
    ]);
    expect(result.value.queue.map((item) => item.daysDue)).toEqual([-6, -6, 4, 4, 77]);
    expect(result.value.queue[0]).toMatchObject({
      taskTitle: "Oil change",
      nextDue: "2026-06-10",
      createdAt: "2026-01-01T00:00:00.000Z",
      intervalValue: 3,
      intervalUnit: "month",
      lastCompletedDate: "2026-05-10",
      assetId: truck.id,
      assetName: "Truck",
      assetType: "vehicle",
    });
    expect(result.value.queueCountsByCategory).toEqual({
      all: 5,
      vehicle: 2,
      equipment: 2,
      property: 1,
    });
  });

  it("omits tasks whose asset is absent from the active asset snapshot", async () => {
    const truck = vehicle("Active truck");
    const archived = vehicle("Archived truck", {
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    const { useCase } = dashboard(
      [truck, archived],
      [
        task(truck.id, { title: "Active task", nextDue: "2026-06-20" }),
        task(archived.id, { title: "Orphan task", nextDue: "2026-06-10" }),
      ],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue.map((item) => item.taskTitle)).toEqual(["Active task"]);
    expect(result.value.fleetTotals).toEqual({
      total: 1,
      vehicle: 1,
      equipment: 0,
      property: 0,
    });
    expect(result.value.queueCountsByCategory).toEqual({
      all: 1,
      vehicle: 1,
      equipment: 0,
      property: 0,
    });
  });

  it("excludes archived assets from totals and queue", async () => {
    const active = vehicle("Active truck");
    const archived = vehicle("Archived truck", {
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    const { useCase } = dashboard(
      [active, archived],
      // findForVisibleActiveAssets omits archived-asset tasks; see D1MaintenanceTaskRepository.test.ts
      [task(active.id, { title: "Oil change", nextDue: "2026-06-20" })],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fleetTotals).toEqual({
      total: 1,
      vehicle: 1,
      equipment: 0,
      property: 0,
    });
    expect(result.value.queue).toHaveLength(1);
    expect(result.value.queue[0]?.assetName).toBe("Active truck");
  });

  it("does not resolve owner names when every active asset is owned by the requester", async () => {
    const truck = vehicle("Personal truck");
    const { useCase, users } = dashboard(
      [truck],
      [task(truck.id, { title: "Oil change", nextDue: "2026-06-20" })],
      [user(ownerId, "Dale", "dale@example.com"), user(teammateId, "Pat", "pat@example.com")],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toEqual([]);
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });

  it("attaches personal sharing on owned personal assets", async () => {
    const truck = vehicle("Personal truck");
    const { useCase } = dashboard(
      [truck],
      [task(truck.id, { title: "Oil change", nextDue: "2026-06-20" })],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });

  it("attaches team sharing without ownerDisplayName when the caller owns a shared asset", async () => {
    const truck = vehicle("Shared truck", { sharedTeamId: teamId });
    const { useCase, users } = dashboard(
      [truck],
      [task(truck.id, { title: "Oil change", nextDue: "2026-06-20" })],
      [user(teammateId, "Pat", "pat@example.com")],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Own shared asset must not trigger other-owner lookup
    expect(users.findByIdsCalls).toEqual([]);
    expect(result.value.queue[0]?.sharing).toEqual({
      scope: "team",
      isOwner: true,
    });
  });

  it("resolves ownerDisplayName only for assets owned by others", async () => {
    const owned = vehicle("My truck", { sharedTeamId: teamId });
    const sharedFromTeammate = vehicle("Teammate truck", {
      ownerId: teammateId,
      sharedTeamId: teamId,
    });
    const sharedFromOther = equipment("Other mower", {
      ownerId: otherTeammateId,
      sharedTeamId: teamId,
    });
    const teammate = user(teammateId, "Pat", "pat@example.com");
    const other = user(otherTeammateId, "Sam", "sam@example.com");
    const { useCase, users } = dashboard(
      [owned, sharedFromTeammate, sharedFromOther],
      [
        task(owned.id, { title: "Mine", nextDue: "2026-06-20" }),
        task(sharedFromTeammate.id, {
          title: "Pat's oil",
          nextDue: "2026-06-18",
          ownerId: teammateId,
        }),
        task(sharedFromOther.id, {
          title: "Sam's blade",
          nextDue: "2026-06-19",
          ownerId: otherTeammateId,
        }),
      ],
      [teammate, other, user(ownerId, "Dale", "dale@example.com")],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toHaveLength(1);
    expect(new Set(users.findByIdsCalls[0])).toEqual(new Set([teammateId, otherTeammateId]));
    expect(users.findByIdsCalls[0]).not.toContain(ownerId);

    const byTitle = Object.fromEntries(
      result.value.queue.map((item) => [item.taskTitle, item.sharing]),
    );
    expect(byTitle["Mine"]).toEqual({ scope: "team", isOwner: true });
    expect(byTitle["Pat's oil"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
    expect(byTitle["Sam's blade"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Sam",
    });
  });

  it("falls back to Unknown when another owner has a null name or is missing", async () => {
    const namelessOwnerId = UserId.generate();
    const missingOwnerId = UserId.generate();
    const namelessShared = vehicle("Nameless truck", {
      ownerId: namelessOwnerId,
      sharedTeamId: teamId,
    });
    const missingShared = vehicle("Missing owner truck", {
      ownerId: missingOwnerId,
      sharedTeamId: teamId,
    });
    const { useCase, users } = dashboard(
      [namelessShared, missingShared],
      [
        task(namelessShared.id, {
          title: "Nameless task",
          nextDue: "2026-06-18",
          ownerId: namelessOwnerId,
        }),
        task(missingShared.id, {
          title: "Missing task",
          nextDue: "2026-06-19",
          ownerId: missingOwnerId,
        }),
      ],
      // only nameless owner is returned; missing owner is absent from the repo
      [user(namelessOwnerId, null, "nameless@example.com")],
    );
    const result = await useCase.execute({ ownerId, viewerDisplayName: "Dale" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toHaveLength(1);
    expect(new Set(users.findByIdsCalls[0])).toEqual(new Set([namelessOwnerId, missingOwnerId]));
    const byTitle = Object.fromEntries(
      result.value.queue.map((item) => [item.taskTitle, item.sharing]),
    );
    expect(byTitle["Nameless task"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Unknown",
    });
    expect(byTitle["Missing task"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Unknown",
    });
  });
});
