import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { Clock } from "../ports/Clock.ts";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import { MarkAllNotificationsRead } from "./MarkAllNotificationsRead.ts";

class NotificationRepoFake implements NotificationRepository {
  markAllReadCalls: { ownerId: UserId; readAt: Date }[] = [];
  countUnreadOwnerId: UserId | null = null;

  constructor(private readonly unreadCount: number) {}

  insertIfAbsent(): Promise<boolean> {
    return Promise.resolve(false);
  }

  findByIdForOwner(): Promise<NotificationRecord | null> {
    return Promise.resolve(null);
  }

  listByOwner(): Promise<NotificationPage> {
    return Promise.resolve({ notifications: [], nextCursor: null });
  }

  countUnread(ownerId: UserId): Promise<number> {
    this.countUnreadOwnerId = ownerId;
    return Promise.resolve(this.unreadCount);
  }

  markRead(): Promise<void> {
    return Promise.resolve();
  }

  markAllRead(ownerId: UserId, readAt: Date): Promise<void> {
    this.markAllReadCalls.push({ ownerId, readAt });
    return Promise.resolve();
  }
}

const now = new Date("2026-07-15T12:00:00.000Z");
const clock: Clock = { now: () => now };

describe("MarkAllNotificationsRead", () => {
  it("marks all owned unread notifications read and returns the resulting unread count", async () => {
    const ownerId = UserId.generate();
    const repo = new NotificationRepoFake(0);

    const result = await new MarkAllNotificationsRead(repo, clock).execute({ ownerId });

    if (!result.ok) throw result.error;
    expect(repo.markAllReadCalls).toEqual([{ ownerId, readAt: now }]);
    expect(repo.countUnreadOwnerId).toBe(ownerId);
    expect(result.value).toEqual({ unreadCount: 0 });
  });
});
