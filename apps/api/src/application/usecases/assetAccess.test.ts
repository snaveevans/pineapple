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

describe("canAccessAsset", () => {
  const ownerId = UserId.generate();
  const memberId = UserId.generate();
  const strangerId = UserId.generate();

  it("allows the asset owner", async () => {
    const asset = makeAsset(ownerId);
    await expect(canAccessAsset(asset, ownerId, new TeamRepositoryFake(null))).resolves.toBe(true);
  });

  it("denies a non-owner when the asset is personal", async () => {
    const asset = makeAsset(ownerId);
    await expect(canAccessAsset(asset, memberId, new TeamRepositoryFake(null))).resolves.toBe(
      false,
    );
  });

  it("allows a team member when the asset is shared to their team", async () => {
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

    await expect(canAccessAsset(asset, memberId, new TeamRepositoryFake(memberTeam))).resolves.toBe(
      true,
    );
  });

  it("denies a stranger when the asset is shared to another team", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const otherTeam = Team.create({ ownerId: strangerId, name: "Other" });
    otherTeam.pullEvents();

    await expect(
      canAccessAsset(asset, strangerId, new TeamRepositoryFake(otherTeam)),
    ).resolves.toBe(false);
  });
});
