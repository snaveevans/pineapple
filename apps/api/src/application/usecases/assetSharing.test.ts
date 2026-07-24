import { describe, expect, it } from "vitest";
import { UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import { Team } from "../../domain/team/Team.ts";
import { toSharingDescriptor } from "./assetSharing.ts";

function makeAsset(ownerId: UserId): Asset {
  const asset = Asset.create({
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
  });
  asset.pullEvents();
  return asset;
}

describe("toSharingDescriptor", () => {
  const ownerId = UserId.generate();
  const memberId = UserId.generate();

  it("marks a personal asset as personal for the owner without ownerDisplayName", () => {
    const asset = makeAsset(ownerId);

    expect(toSharingDescriptor(asset, ownerId, null)).toEqual({
      scope: "personal",
      isOwner: true,
    });
    expect(toSharingDescriptor(asset, ownerId, "Owner Name")).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });

  it("marks a shared asset as team for the owner without ownerDisplayName even when a name is supplied", () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    expect(toSharingDescriptor(asset, ownerId, "Owner Name")).toEqual({
      scope: "team",
      isOwner: true,
    });
  });

  it("includes ownerDisplayName for a non-owner of a shared asset", () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    expect(toSharingDescriptor(asset, memberId, "Pat")).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });

  it("omits ownerDisplayName for a non-owner when the display name is null", () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    expect(toSharingDescriptor(asset, memberId, null)).toEqual({
      scope: "team",
      isOwner: false,
    });
  });

  it("marks a personal asset as personal and not owned for a non-owner", () => {
    const asset = makeAsset(ownerId);

    expect(toSharingDescriptor(asset, memberId, "Pat")).toEqual({
      scope: "personal",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });
});
