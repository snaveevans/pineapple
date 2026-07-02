import {
  AssetId,
  MaintenanceTaskId,
  NotFoundError,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { Clock } from "../ports/Clock.ts";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import { MarkNotificationRead } from "./MarkNotificationRead.ts";

class NotificationRepoFake implements NotificationRepository {
  markReadCalls: { id: NotificationId; ownerId: UserId; readAt: Date }[] = [];

  constructor(private readonly found: NotificationRecord | null) {}

  insertIfAbsent(): Promise<boolean> {
    return Promise.resolve(false);
  }

  listByEmailBatch(): Promise<NotificationRecord[]> {
    return Promise.resolve([]);
  }

  findByIdForOwner(): Promise<NotificationRecord | null> {
    return Promise.resolve(this.found);
  }

  listByOwner(): Promise<NotificationPage> {
    return Promise.resolve({ notifications: [], nextCursor: null });
  }

  countUnread(): Promise<number> {
    return Promise.resolve(0);
  }

  markRead(id: NotificationId, ownerId: UserId, readAt: Date): Promise<void> {
    this.markReadCalls.push({ id, ownerId, readAt });
    return Promise.resolve();
  }

  markAllRead(): Promise<void> {
    return Promise.resolve();
  }
}

const now = new Date("2026-07-15T12:00:00.000Z");
const clock: Clock = { now: () => now };

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: NotificationId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck snapshot",
    assetType: "vehicle",
    taskTitle: "Oil change snapshot",
    nextDue: "2026-07-20",
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

describe("MarkNotificationRead", () => {
  it("marks one owned unread notification read and returns the updated safe read model", async () => {
    const ownerId = UserId.generate();
    const item = notification({ ownerId });
    const repo = new NotificationRepoFake(item);

    const result = await new MarkNotificationRead(repo, clock).execute({
      notificationId: item.id,
      ownerId,
    });

    if (!result.ok) throw result.error;
    expect(repo.markReadCalls).toEqual([{ id: item.id, ownerId, readAt: now }]);
    expect(result.value).toEqual({
      id: item.id,
      type: "maintenance_due_soon",
      createdAt: "2026-07-13T00:00:00.000Z",
      readAt: "2026-07-15T12:00:00.000Z",
      asset: {
        id: item.assetId,
        name: "Truck snapshot",
        type: "vehicle",
      },
      task: {
        id: item.maintenanceTaskId,
        title: "Oil change snapshot",
        nextDue: "2026-07-20",
      },
    });
    expect(JSON.stringify(result.value)).not.toContain(ownerId);
    expect(JSON.stringify(result.value)).not.toContain("system");
  });

  it("is idempotent for an already-read owned notification", async () => {
    const ownerId = UserId.generate();
    const readAt = new Date("2026-07-14T00:00:00.000Z");
    const item = notification({ ownerId, readAt });
    const repo = new NotificationRepoFake(item);

    const result = await new MarkNotificationRead(repo, clock).execute({
      notificationId: item.id,
      ownerId,
    });

    if (!result.ok) throw result.error;
    expect(repo.markReadCalls).toHaveLength(0);
    expect(result.value.readAt).toBe("2026-07-14T00:00:00.000Z");
  });

  it("returns not found for unknown or foreign notifications", async () => {
    const result = await new MarkNotificationRead(new NotificationRepoFake(null), clock).execute({
      notificationId: NotificationId.generate(),
      ownerId: UserId.generate(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });
});
