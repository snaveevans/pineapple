import { describe, expect, it } from "vitest";
import { AssetId, Email, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { ListAssets } from "./ListAssets.ts";

class AssetRepositoryFake implements AssetRepository {
  requestedUserId: UserId | null = null;

  constructor(private readonly assets: Asset[]) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    this.requestedUserId = userId;
    // Return the visible set as-is; owner/team access is enforced by the real repo.
    return Promise.resolve(this.assets);
  }

  save(): Promise<void> {
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

describe("ListAssets", () => {
  const ownerId = UserId.generate();
  const teammateId = UserId.generate();
  const otherTeammateId = UserId.generate();
  const teamId = TeamId.generate();

  function user(id: UserId, name: string | null, email: string): User {
    return User.reconstitute({
      id,
      email: Email.from(email),
      name,
      onboardingCompletedAt: name === null ? null : new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  function vehicle(
    name: string,
    props?: {
      ownerId?: UserId;
      sharedTeamId?: TeamId | null;
      archivedAt?: Date | null;
      id?: AssetId;
    },
  ): Asset {
    return Asset.reconstitute({
      id: props?.id ?? AssetId.generate(),
      ownerId: props?.ownerId ?? ownerId,
      name,
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      archivedAt: props?.archivedAt ?? null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      sharedTeamId: props?.sharedTeamId ?? null,
    });
  }

  function equipment(
    name: string,
    props?: { ownerId?: UserId; sharedTeamId?: TeamId | null },
  ): Asset {
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

  function property(name: string): Asset {
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

  it("returns active assets with exact per-type counts in repository order", async () => {
    const vehicleA = vehicle("Truck A");
    const vehicleB = vehicle("Truck B");
    const equip = equipment("Generator");
    const cabin = property("Cabin");
    const secondEquip = equipment("Mower");
    const archived = vehicle("Archived mower", {
      archivedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    // Visible set includes a foreign asset that findVisibleTo would not return in
    // production for a non-shared case — here the fake returns the full list so we
    // can pin order preservation and archived filtering independently.
    const repository = new AssetRepositoryFake([
      vehicleA,
      archived,
      equip,
      cabin,
      vehicleB,
      secondEquip,
    ]);
    const users = new UserRepositoryFake();

    const result = await new ListAssets(repository, users).execute({
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Order is repository order with archived stripped — not re-sorted
    expect(result.value.assets.map((item) => item.asset.name)).toEqual([
      "Truck A",
      "Generator",
      "Cabin",
      "Truck B",
      "Mower",
    ]);
    expect(result.value.assets.map((item) => item.asset.id)).toEqual([
      vehicleA.id,
      equip.id,
      cabin.id,
      vehicleB.id,
      secondEquip.id,
    ]);
    expect(result.value.assets.every((item) => item.sharing.isOwner)).toBe(true);
    expect(result.value.assets.every((item) => item.sharing.scope === "personal")).toBe(true);
    // Exact multi-type totals kill counts[type]++ → --
    expect(result.value.counts).toEqual({ all: 5, vehicle: 2, equipment: 2, property: 1 });
    expect(repository.requestedUserId).toBe(ownerId);
    expect(users.findByIdsCalls).toEqual([]);
  });

  it("returns zero counts when the owner has no active assets", async () => {
    const archived = vehicle("Archived truck", {
      archivedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const users = new UserRepositoryFake([user(teammateId, "Pat", "pat@example.com")]);

    const result = await new ListAssets(new AssetRepositoryFake([archived]), users).execute({
      requesterId: ownerId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        assets: [],
        counts: { all: 0, vehicle: 0, equipment: 0, property: 0 },
      },
    });
    expect(users.findByIdsCalls).toEqual([]);
  });

  it("does not look up owner names when every active asset is owned by the requester", async () => {
    const ownedShared = vehicle("Shared truck", { sharedTeamId: teamId });
    const users = new UserRepositoryFake([
      user(ownerId, "Dale", "dale@example.com"),
      user(teammateId, "Pat", "pat@example.com"),
    ]);

    const result = await new ListAssets(new AssetRepositoryFake([ownedShared]), users).execute({
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toEqual([]);
    expect(result.value.assets[0]?.sharing).toEqual({
      scope: "team",
      isOwner: true,
    });
    expect(result.value.counts).toEqual({ all: 1, vehicle: 1, equipment: 0, property: 0 });
  });

  it("resolves ownerDisplayName for assets owned by others and not the requester", async () => {
    const owned = vehicle("My truck", { sharedTeamId: teamId });
    const fromTeammate = vehicle("Pat truck", {
      ownerId: teammateId,
      sharedTeamId: teamId,
    });
    const fromOther = equipment("Sam mower", {
      ownerId: otherTeammateId,
      sharedTeamId: teamId,
    });
    // Duplicate other-owner assets must still produce a single id in the lookup set
    const fromTeammateAgain = vehicle("Pat second truck", {
      ownerId: teammateId,
      sharedTeamId: teamId,
    });
    const users = new UserRepositoryFake([
      user(teammateId, "Pat", "pat@example.com"),
      user(otherTeammateId, "Sam", "sam@example.com"),
      user(ownerId, "Dale", "dale@example.com"),
    ]);
    const repository = new AssetRepositoryFake([owned, fromTeammate, fromOther, fromTeammateAgain]);

    const result = await new ListAssets(repository, users).execute({ requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toHaveLength(1);
    expect(new Set(users.findByIdsCalls[0])).toEqual(new Set([teammateId, otherTeammateId]));
    expect(users.findByIdsCalls[0]).not.toContain(ownerId);
    // Deduped set — two assets from teammateId still yield one id
    expect(users.findByIdsCalls[0]).toHaveLength(2);

    expect(result.value.assets.map((item) => item.asset.name)).toEqual([
      "My truck",
      "Pat truck",
      "Sam mower",
      "Pat second truck",
    ]);
    expect(result.value.assets.map((item) => item.sharing)).toEqual([
      { scope: "team", isOwner: true },
      { scope: "team", isOwner: false, ownerDisplayName: "Pat" },
      { scope: "team", isOwner: false, ownerDisplayName: "Sam" },
      { scope: "team", isOwner: false, ownerDisplayName: "Pat" },
    ]);
    expect(result.value.counts).toEqual({ all: 4, vehicle: 3, equipment: 1, property: 0 });
  });

  it("falls back to Unknown when another owner has a null name or is missing", async () => {
    const namelessOwnerId = UserId.generate();
    const missingOwnerId = UserId.generate();
    const nameless = vehicle("Nameless truck", {
      ownerId: namelessOwnerId,
      sharedTeamId: teamId,
    });
    const missing = equipment("Missing mower", {
      ownerId: missingOwnerId,
      sharedTeamId: teamId,
    });
    const users = new UserRepositoryFake([user(namelessOwnerId, null, "nameless@example.com")]);

    const result = await new ListAssets(
      new AssetRepositoryFake([nameless, missing]),
      users,
    ).execute({ requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(users.findByIdsCalls).toHaveLength(1);
    expect(new Set(users.findByIdsCalls[0])).toEqual(new Set([namelessOwnerId, missingOwnerId]));
    expect(result.value.assets.map((item) => item.sharing)).toEqual([
      { scope: "team", isOwner: false, ownerDisplayName: "Unknown" },
      { scope: "team", isOwner: false, ownerDisplayName: "Unknown" },
    ]);
    expect(result.value.counts).toEqual({ all: 2, vehicle: 1, equipment: 1, property: 0 });
  });

  it("attaches personal sharing on owned personal assets", async () => {
    const truck = vehicle("Personal truck");
    const result = await new ListAssets(
      new AssetRepositoryFake([truck]),
      new UserRepositoryFake(),
    ).execute({ requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assets[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });
});
