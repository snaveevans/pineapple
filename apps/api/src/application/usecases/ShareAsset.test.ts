import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UserId,
  ValidationError,
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
  saveCalls = 0;

  constructor(private asset: Asset | null) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(this.asset);
  }

  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  save(asset: Asset, events: readonly DomainEvent[] = []): Promise<void> {
    this.saveCalls += 1;
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
  publishAllCalls = 0;

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.publishAllCalls += 1;
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

describe("ShareAsset", () => {
  const ownerId = UserId.generate();
  const otherId = UserId.generate();

  it("shares the asset to the owner's team and publishes AssetSharedToTeam", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
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
    expect(eventBus.publishAllCalls).toBe(1);
    expect(assets.savedEvents).toHaveLength(1);
    expect(assets.saveCalls).toBe(1);
  });

  it("is idempotent when already shared to the caller's team", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    expect(eventBus.publishAllCalls).toBe(0);
    expect(assets.savedEvents).toHaveLength(0);
  });

  it("returns ConflictError when the owner has no team", async () => {
    const asset = makeAsset(ownerId);
    const assets = new FakeAssetRepository(asset);
    const result = await new ShareAsset(
      assets,
      new FakeTeamRepository(null),
      new RecordingEventBus(),
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConflictError);
    expect(assets.saveCalls).toBe(0);
  });

  it("returns ForbiddenError when a non-owner team member tries to share", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops", [otherId]);
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
      assetId: asset.id,
      requesterId: otherId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(assets.saveCalls).toBe(0);
    expect(eventBus.publishAllCalls).toBe(0);
    expect(asset.sharedTeamId).toBe(team.id);
  });

  it("returns ForbiddenError when a stranger with no team relationship tries to share a shared asset", async () => {
    const asset = makeAsset(ownerId);
    const ownerTeam = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: ownerTeam.id, teamName: ownerTeam.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(assets, new FakeTeamRepository(null), eventBus).execute({
      assetId: asset.id,
      requesterId: otherId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(assets.saveCalls).toBe(0);
    expect(eventBus.publishAllCalls).toBe(0);
  });

  it("returns ForbiddenError when a stranger tries to share someone else's personal asset", async () => {
    const asset = makeAsset(ownerId);
    const assets = new FakeAssetRepository(asset);
    const strangerTeam = makeTeam(otherId, "Other");
    const eventBus = new RecordingEventBus();

    const result = await new ShareAsset(
      assets,
      new FakeTeamRepository(strangerTeam),
      eventBus,
    ).execute({ assetId: asset.id, requesterId: otherId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(assets.saveCalls).toBe(0);
    expect(eventBus.publishAllCalls).toBe(0);
    expect(asset.sharedTeamId).toBeNull();
  });

  it("returns NotFoundError when the asset does not exist", async () => {
    const result = await new ShareAsset(
      new FakeAssetRepository(null),
      new FakeTeamRepository(null),
      new RecordingEventBus(),
    ).execute({ assetId: AssetId.generate(), requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns a domain error thrown while saving", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    const assets = new FakeAssetRepository(asset);
    assets.save = () => Promise.reject(new ValidationError("save failed", "asset"));

    const result = await new ShareAsset(
      assets,
      new FakeTeamRepository(team),
      new RecordingEventBus(),
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    if (!(result.error instanceof ValidationError)) return;
    expect(result.error.field).toBe("asset");
  });

  it("rethrows non-domain errors from save", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    const assets = new FakeAssetRepository(asset);
    assets.save = () => Promise.reject(new TypeError("disk full"));

    await expect(
      new ShareAsset(assets, new FakeTeamRepository(team), new RecordingEventBus()).execute({
        assetId: asset.id,
        requesterId: ownerId,
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
