import { describe, expect, it } from "vitest";
import { ActivityEntryId, AssetId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import type { ActivityEntry, ActivityReadModel } from "../../domain/activity/ActivityEntry.ts";
import type { ActivityLogQuery, ActivityLogRepository } from "../ports/ActivityLogRepository.ts";
import { DEFAULT_ACTIVITY_LIMIT, ListActivity, MAX_ACTIVITY_LIMIT } from "./ListActivity.ts";

class FakeActivityLogRepository implements ActivityLogRepository {
  lastQuery: ActivityLogQuery | null = null;

  constructor(private readonly model: ActivityReadModel | (() => Promise<ActivityReadModel>)) {}

  list(query: ActivityLogQuery): Promise<ActivityReadModel> {
    this.lastQuery = query;
    if (typeof this.model === "function") return this.model();
    return Promise.resolve(this.model);
  }
}

class ThrowingActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly error: Error) {}

  list(): Promise<ActivityReadModel> {
    return Promise.reject(this.error);
  }
}

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  const assetId = AssetId.generate();
  const actorId = UserId.generate();
  return {
    id: ActivityEntryId.generate(),
    type: "asset_added",
    occurredAt: new Date("2026-07-01T12:00:00.000Z"),
    asset: { id: assetId, name: "Truck", type: "vehicle" },
    actor: { id: actorId, displayName: "Dale" },
    ...overrides,
  };
}

function readModel(overrides: Partial<ActivityReadModel> = {}): ActivityReadModel {
  const viewerUserId = UserId.generate();
  return {
    viewerUserId,
    entries: [],
    availableFilters: { types: [], assets: [] },
    nextCursor: null,
    ...overrides,
  };
}

describe("ListActivity", () => {
  it("exports the activity page size contract", () => {
    expect(DEFAULT_ACTIVITY_LIMIT).toBe(25);
    expect(MAX_ACTIVITY_LIMIT).toBe(50);
  });

  it("returns the activity read model from the repository", async () => {
    const ownerId = UserId.generate();
    const assetId = AssetId.generate();
    const item = entry({
      type: "maintenance_logged",
      asset: { id: assetId, name: "Truck", type: "vehicle" },
      title: "Oil change",
      performedAt: "2026-06-15",
    });
    const model = readModel({
      viewerUserId: ownerId,
      entries: [item],
      availableFilters: {
        types: [
          { type: "maintenance_logged", count: 1 },
          { type: "asset_added", count: 2 },
        ],
        assets: [{ asset: { id: assetId, name: "Truck", type: "vehicle" }, count: 1 }],
      },
      nextCursor: "cursor-2",
    });
    const repo = new FakeActivityLogRepository(model);

    const result = await new ListActivity(repo).execute({
      ownerId,
      limit: DEFAULT_ACTIVITY_LIMIT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(model);
    expect(result.value.entries).toHaveLength(1);
    expect(result.value.entries[0]?.type).toBe("maintenance_logged");
    expect(result.value.entries[0]?.title).toBe("Oil change");
    expect(result.value.availableFilters.types).toEqual([
      { type: "maintenance_logged", count: 1 },
      { type: "asset_added", count: 2 },
    ]);
    expect(result.value.nextCursor).toBe("cursor-2");
    expect(repo.lastQuery).toEqual({ ownerId, limit: DEFAULT_ACTIVITY_LIMIT });
  });

  it("forwards type, assetId, and cursor filters to the repository", async () => {
    const ownerId = UserId.generate();
    const assetId = AssetId.generate();
    const model = readModel({ viewerUserId: ownerId });
    const repo = new FakeActivityLogRepository(model);

    const result = await new ListActivity(repo).execute({
      ownerId,
      limit: MAX_ACTIVITY_LIMIT,
      type: "task_completed",
      assetId,
      cursor: "page-token",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(model);
    expect(repo.lastQuery).toEqual({
      ownerId,
      limit: MAX_ACTIVITY_LIMIT,
      type: "task_completed",
      assetId,
      cursor: "page-token",
    });
  });

  it("returns an empty page when the repository has no activity", async () => {
    const ownerId = UserId.generate();
    const model = readModel({ viewerUserId: ownerId });
    const repo = new FakeActivityLogRepository(model);

    const result = await new ListActivity(repo).execute({ ownerId, limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toEqual([]);
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.viewerUserId).toBe(ownerId);
    expect(repo.lastQuery?.limit).toBe(10);
  });

  it("returns DomainError thrown by the repository as err", async () => {
    const result = await new ListActivity(
      new ThrowingActivityLogRepository(new ValidationError("bad cursor", "cursor")),
    ).execute({ ownerId: UserId.generate(), limit: 25 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect((result.error as ValidationError).field).toBe("cursor");
  });

  it("rethrows non-domain errors", async () => {
    await expect(
      new ListActivity(new ThrowingActivityLogRepository(new Error("db down"))).execute({
        ownerId: UserId.generate(),
        limit: 25,
      }),
    ).rejects.toThrow("db down");
  });
});
