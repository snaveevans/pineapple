import { describe, expect, it } from "vitest";
import {
  AssetId,
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
import { UnshareAsset } from "./UnshareAsset.ts";

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
  findByIdCalls = 0;
  lastFindById: string | null = null;

  constructor(
    private readonly byMember: Team | null,
    private readonly byId: Team | null = byMember,
  ) {}

  findByMember(): Promise<Team | null> {
    return Promise.resolve(this.byMember);
  }

  findById(id: Team["id"]): Promise<Team | null> {
    this.findByIdCalls += 1;
    this.lastFindById = id;
    return Promise.resolve(this.byId);
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

describe("UnshareAsset", () => {
  const ownerId = UserId.generate();
  const otherId = UserId.generate();

  it("unshares a shared asset and publishes AssetUnsharedFromTeam with team details", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharedTeamId).toBeNull();
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.publishAllCalls).toBe(1);
    expect(eventBus.events[0]).toMatchObject({
      type: "AssetUnsharedFromTeam",
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      assetName: "Truck",
      teamId: team.id,
      teamName: "Field Ops",
    });
    expect(assets.saveCalls).toBe(1);
    expect(assets.savedEvents).toHaveLength(1);
  });

  it("uses Unknown team when the shared team row is missing", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(
      new FakeAssetRepository(asset),
      new FakeTeamRepository(null, null),
      eventBus,
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(true);
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]).toMatchObject({
      type: "AssetUnsharedFromTeam",
      teamId: team.id,
      teamName: "Unknown team",
    });
  });

  it("is idempotent when the asset is already personal", async () => {
    const asset = makeAsset(ownerId);
    const assets = new FakeAssetRepository(asset);
    const teams = new FakeTeamRepository(null);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(assets, teams, eventBus).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sharedTeamId).toBeNull();
    expect(eventBus.events).toHaveLength(0);
    expect(eventBus.publishAllCalls).toBe(0);
    expect(teams.findByIdCalls).toBe(0);
    expect(assets.saveCalls).toBe(0);
  });

  it("returns ForbiddenError when a non-owner team member tries to unshare", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops", [otherId]);
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
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

  it("returns ForbiddenError when a stranger with no team relationship tries to unshare", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(assets, new FakeTeamRepository(null), eventBus).execute({
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

  it("returns ForbiddenError when a stranger on another team tries to unshare", async () => {
    const asset = makeAsset(ownerId);
    const ownerTeam = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: ownerTeam.id, teamName: ownerTeam.name, actorId: ownerId });
    asset.pullEvents();
    const strangerTeam = makeTeam(otherId, "Other");
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(
      assets,
      new FakeTeamRepository(strangerTeam),
      eventBus,
    ).execute({ assetId: asset.id, requesterId: otherId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(assets.saveCalls).toBe(0);
    expect(eventBus.publishAllCalls).toBe(0);
  });

  it("returns NotFoundError when the asset does not exist", async () => {
    const result = await new UnshareAsset(
      new FakeAssetRepository(null),
      new FakeTeamRepository(null),
      new RecordingEventBus(),
    ).execute({
      assetId: AssetId.generate(),
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns a domain error thrown while saving", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    assets.save = () => Promise.reject(new ValidationError("save failed", "asset"));

    const result = await new UnshareAsset(
      assets,
      new FakeTeamRepository(team),
      new RecordingEventBus(),
    ).execute({ assetId: asset.id, requesterId: ownerId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    if (!(result.error instanceof ValidationError)) return;
    expect(result.error.field).toBe("asset");
  });

  it("rethrows non-domain errors from save", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const assets = new FakeAssetRepository(asset);
    assets.save = () => Promise.reject(new TypeError("disk full"));

    await expect(
      new UnshareAsset(assets, new FakeTeamRepository(team), new RecordingEventBus()).execute({
        assetId: asset.id,
        requesterId: ownerId,
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("does not publish when unshare yields no events", async () => {
    const asset = makeAsset(ownerId);
    const team = makeTeam(ownerId, "Field Ops");
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    asset.pullEvents = () => [];
    const assets = new FakeAssetRepository(asset);
    const eventBus = new RecordingEventBus();

    const result = await new UnshareAsset(assets, new FakeTeamRepository(team), eventBus).execute({
      assetId: asset.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(assets.saveCalls).toBe(1);
    expect(eventBus.publishAllCalls).toBe(0);
    expect(eventBus.events).toHaveLength(0);
  });
});
