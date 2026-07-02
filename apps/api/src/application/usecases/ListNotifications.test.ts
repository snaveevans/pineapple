import {
  AssetId,
  MaintenanceTaskId,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import { ListNotifications } from "./ListNotifications.ts";

class NotificationRepoFake implements NotificationRepository {
  listArgs: { ownerId: UserId; limit: number; cursor: string | null } | null = null;
  countOwnerId: UserId | null = null;

  constructor(
    private readonly page: NotificationPage,
    private readonly unreadCount: number,
  ) {}

  insertIfAbsent(): Promise<boolean> {
    return Promise.resolve(false);
  }

  listByEmailBatch(): Promise<NotificationRecord[]> {
    return Promise.resolve([]);
  }

  findByIdForOwner(): Promise<NotificationRecord | null> {
    return Promise.resolve(null);
  }

  listByOwner(ownerId: UserId, limit: number, cursor: string | null): Promise<NotificationPage> {
    this.listArgs = { ownerId, limit, cursor };
    return Promise.resolve(this.page);
  }

  countUnread(ownerId: UserId): Promise<number> {
    this.countOwnerId = ownerId;
    return Promise.resolve(this.unreadCount);
  }

  markRead(): Promise<void> {
    return Promise.resolve();
  }

  markAllRead(): Promise<void> {
    return Promise.resolve();
  }
}

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: NotificationId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Deleted truck snapshot",
    assetType: "vehicle",
    taskTitle: "Archived task snapshot",
    nextDue: "2026-07-20",
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

describe("ListNotifications", () => {
  it("lists only through the owner-scoped repository and returns unread count", async () => {
    const ownerId = UserId.generate();
    const cursor = "opaque-cursor";
    const repo = new NotificationRepoFake({ notifications: [], nextCursor: null }, 4);

    const result = await new ListNotifications(repo).execute({ ownerId, limit: 20, cursor });

    if (!result.ok) throw result.error;
    expect(repo.listArgs).toEqual({ ownerId, limit: 20, cursor });
    expect(repo.countOwnerId).toBe(ownerId);
    expect(result.value).toEqual({ notifications: [], unreadCount: 4, nextCursor: null });
  });

  it("serializes self-contained notification snapshots without owner or actor identifiers", async () => {
    const ownerId = UserId.generate();
    const item = notification({
      ownerId,
      assetName: "Old van name",
      assetType: "vehicle",
      taskTitle: "Rotate tires",
      readAt: new Date("2026-07-14T01:02:03.000Z"),
    });
    const repo = new NotificationRepoFake(
      { notifications: [item], nextCursor: "next-page" },
      1,
    );

    const result = await new ListNotifications(repo).execute({
      ownerId,
      limit: 50,
      cursor: null,
    });

    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      notifications: [
        {
          id: item.id,
          type: "maintenance_due_soon",
          createdAt: "2026-07-13T00:00:00.000Z",
          readAt: "2026-07-14T01:02:03.000Z",
          asset: {
            id: item.assetId,
            name: "Old van name",
            type: "vehicle",
          },
          task: {
            id: item.maintenanceTaskId,
            title: "Rotate tires",
            nextDue: "2026-07-20",
          },
        },
      ],
      unreadCount: 1,
      nextCursor: "next-page",
    });
    expect(JSON.stringify(result.value)).not.toContain(ownerId);
    expect(JSON.stringify(result.value)).not.toContain("system");
  });
});
