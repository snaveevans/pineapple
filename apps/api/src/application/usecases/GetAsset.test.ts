import { describe, expect, it } from "vitest";
import {
  AssetId,
  Email,
  ForbiddenError,
  NotFoundError,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { GetAsset } from "./GetAsset.ts";

class FakeAssetRepository implements AssetRepository {
  constructor(private readonly asset: Asset | null) {}

  findById(id: AssetId): Promise<Asset | null> {
    if (this.asset && this.asset.id === id) return Promise.resolve(this.asset);
    if (this.asset && id !== this.asset.id) return Promise.resolve(null);
    return Promise.resolve(this.asset);
  }

  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeTeamRepository implements TeamRepository {
  constructor(private readonly team: Team | null) {}

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

class FakeUserRepository implements UserRepository {
  requestedIds: UserId[] | null = null;

  constructor(private readonly users: User[] = []) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.users[0] ?? null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    this.requestedIds = [...ids];
    return Promise.resolve(this.users.filter((user) => ids.includes(user.id)));
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class ThrowingAssetRepository implements AssetRepository {
  constructor(private readonly error: Error) {}

  findById(): Promise<Asset | null> {
    return Promise.reject(this.error);
  }

  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

function makeAsset(ownerId: UserId): Asset {
  const asset = Asset.create({
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
  });
  asset.pullEvents();
  return asset;
}

describe("GetAsset", () => {
  const ownerId = UserId.generate();
  const memberId = UserId.generate();
  const strangerId = UserId.generate();

  it("returns the asset with personal sharing when the owner requests it", async () => {
    const asset = makeAsset(ownerId);
    const users = new FakeUserRepository();

    const result = await new GetAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(null),
      users,
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.asset).toBe(asset);
    expect(result.value.sharing).toEqual({ scope: "personal", isOwner: true });
    expect(users.requestedIds).toBeNull();
  });

  it("returns team sharing with owner display name for a teammate", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
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
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    const owner = User.reconstitute({
      id: ownerId,
      email: Email.from("owner@example.com"),
      name: "Dale",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const users = new FakeUserRepository([owner]);

    const result = await new GetAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(memberTeam),
      users,
    ).execute({ assetId: asset.id, requesterId: memberId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.asset).toBe(asset);
    expect(result.value.sharing).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Dale",
    });
    expect(users.requestedIds).toEqual([ownerId]);
  });

  it("falls back to Unknown when the owner has no display name", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
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
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    const owner = User.reconstitute({
      id: ownerId,
      email: Email.from("owner@example.com"),
      name: null,
      onboardingCompletedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await new GetAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(memberTeam),
      new FakeUserRepository([owner]),
    ).execute({ assetId: asset.id, requesterId: memberId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharing).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Unknown",
    });
  });

  it("falls back to Unknown when the owner user row is missing", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
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
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    const result = await new GetAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(memberTeam),
      new FakeUserRepository([]),
    ).execute({ assetId: asset.id, requesterId: memberId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharing.ownerDisplayName).toBe("Unknown");
    expect(result.value.sharing.isOwner).toBe(false);
    expect(result.value.sharing.scope).toBe("team");
  });

  it("returns NotFoundError when the asset does not exist", async () => {
    const result = await new GetAsset(
      new FakeAssetRepository(null),
      new FakeTeamRepository(null),
      new FakeUserRepository(),
    ).execute({ assetId: AssetId.generate(), requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns ForbiddenError when a stranger cannot access the asset", async () => {
    const asset = makeAsset(ownerId);

    const result = await new GetAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(null),
      new FakeUserRepository(),
    ).execute({ assetId: asset.id, requesterId: strangerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("returns DomainError thrown by a dependency as err", async () => {
    const result = await new GetAsset(
      new ThrowingAssetRepository(new ValidationError("bad id", "assetId")),
      new FakeTeamRepository(null),
      new FakeUserRepository(),
    ).execute({ assetId: AssetId.generate(), requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect((result.error as ValidationError).field).toBe("assetId");
  });

  it("rethrows non-domain errors", async () => {
    await expect(
      new GetAsset(
        new ThrowingAssetRepository(new Error("db down")),
        new FakeTeamRepository(null),
        new FakeUserRepository(),
      ).execute({ assetId: AssetId.generate(), requesterId: ownerId }),
    ).rejects.toThrow("db down");
  });
});
