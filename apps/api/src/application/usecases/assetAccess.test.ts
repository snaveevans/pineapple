import { describe, expect, it } from "vitest";
import { UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { canAccessAsset } from "./assetAccess.ts";

class TeamRepositoryFake implements TeamRepository {
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

function makeAsset(ownerId: UserId): Asset {
  const asset = Asset.create({
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
  });
  asset.pullEvents();
  return asset;
}

function makeTeam(ownerId: UserId, name: string, extraMemberIds: UserId[] = []): Team {
  const team = Team.create({ ownerId, name });
  team.pullEvents();
  if (extraMemberIds.length === 0) return team;
  return Team.reconstitute({
    id: team.id,
    ownerId: team.ownerId,
    name: team.name,
    createdAt: team.createdAt,
    members: [
      ...team.members,
      ...extraMemberIds.map((userId) =>
        createMembership({ userId, role: "member", joinedAt: new Date() }),
      ),
    ],
  });
}

describe("canAccessAsset", () => {
  const ownerId = UserId.generate();
  const memberId = UserId.generate();
  const strangerId = UserId.generate();

  it("allows the asset owner (personal)", async () => {
    const asset = makeAsset(ownerId);
    await expect(canAccessAsset(asset, ownerId, new TeamRepositoryFake(null))).resolves.toBe(true);
  });

  it("allows the asset owner even when shared to a team", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    await expect(canAccessAsset(asset, ownerId, new TeamRepositoryFake(null))).resolves.toBe(true);
  });

  it("denies a non-owner when the asset is personal", async () => {
    const asset = makeAsset(ownerId);
    await expect(canAccessAsset(asset, memberId, new TeamRepositoryFake(null))).resolves.toBe(
      false,
    );
  });

  it("denies a non-owner with a team when the asset is personal", async () => {
    const asset = makeAsset(ownerId);
    const otherTeam = makeTeam(memberId, "Other crew");
    await expect(canAccessAsset(asset, memberId, new TeamRepositoryFake(otherTeam))).resolves.toBe(
      false,
    );
  });

  it("allows a team member when the asset is shared to their team", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops", [memberId]);
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    await expect(canAccessAsset(asset, memberId, new TeamRepositoryFake(team))).resolves.toBe(true);
  });

  it("denies a stranger when the asset is shared to another team", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const otherTeam = makeTeam(strangerId, "Other");

    await expect(
      canAccessAsset(asset, strangerId, new TeamRepositoryFake(otherTeam)),
    ).resolves.toBe(false);
  });

  it("denies a requester with no team when the asset is shared", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    await expect(canAccessAsset(asset, strangerId, new TeamRepositoryFake(null))).resolves.toBe(
      false,
    );
  });
});
