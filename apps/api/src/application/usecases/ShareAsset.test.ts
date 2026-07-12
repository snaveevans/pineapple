import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UserId,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { ShareAsset } from "./ShareAsset.ts";

class FakeAssetRepository implements AssetRepository {
  saved: Asset | null = null;
  savedEvents: readonly DomainEvent[] = [];

  constructor(private asset: Asset | null) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(this.asset);
  }

  findByOwner(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  save(asset: Asset, events: readonly DomainEvent[] = []): Promise<void> {
    this.saved = asset;
    this.savedEvents = events;
    return Promise.resolve();
  }
}

class FakeTeamRepository implements TeamRepository {
  constructor(private team: Team | null) {}

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

class RecordingEventBus implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) this.events.push(event);
    return Promise.resolve();
  }

  subscribe(): void {}
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

describe("ShareAsset", () => {
  const ownerId = UserId.generate();
  const otherId = UserId.generate();

  it("shares the asset to the owner's team and publishes AssetSharedToTeam", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharedTeamId).toBe(team.id);
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]?.type).toBe("AssetSharedToTeam");
    expect(assets.savedEvents).toHaveLength(1);
  });

  it("is idempotent when already shared to the caller's team", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(team),
      eventBus,
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    expect(eventBus.events).toHaveLength(0);
  });

  it("returns 409 when the owner has no team", async () => {
    const asset = makeAsset(ownerId);
    const result = await new ShareAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(null),
      new RecordingEventBus(),
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
  });

  it("returns 403 when a non-owner tries to share", async () => {
    const asset = makeAsset(ownerId);
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    // Simulate other user as member of same team (would need membership API; use reconstitute)
    const memberTeam = Team.reconstitute({
      id: team.id,
      ownerId: team.ownerId,
      name: team.name,
      createdAt: team.createdAt,
      members: [
        ...team.members,
        createMembership({ userId: otherId, role: "member", joinedAt: new Date() }),
      ],
    });
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();

    const result = await new ShareAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(memberTeam),
      new RecordingEventBus(),
    ).execute({ assetId: asset.id, requesterId: otherId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("returns 404 when the asset does not exist", async () => {
    const result = await new ShareAsset(
      new FakeAssetRepository(null),
      new FakeTeamRepository(null),
      new RecordingEventBus(),
    ).execute({ assetId: AssetId.generate(), requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns 403 when a stranger tries to share someone else's personal asset", async () => {
    const asset = makeAsset(ownerId);
    const result = await new ShareAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(Team.create({ ownerId: otherId, name: "Other" })),
      new RecordingEventBus(),
    ).execute({ assetId: asset.id, requesterId: otherId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
  });
});
