import { AssetId, MaintenanceTaskId, NotificationId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "../../application/ports/NotificationRepository.ts";
import { D1NotificationRepository } from "./D1NotificationRepository.ts";

type BoundStatement = { query: string; values: unknown[] };

function harness(opts: { rows?: unknown[]; first?: unknown; changes?: number } = {}) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(opts.first ?? null),
        all: vi.fn().mockResolvedValue({ results: opts.rows ?? [] }),
        run: vi.fn().mockResolvedValue({ meta: { changes: opts.changes ?? 0 } }),
      };
    },
  }));
  return { db: { prepare } as unknown as D1Database, statements };
}

function record(): NotificationRecord {
  return {
    id: NotificationId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-20",
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    readAt: null,
  };
}

describe("D1NotificationRepository", () => {
  it("insertIfAbsent reports true when a row was inserted", async () => {
    const { db, statements } = harness({ changes: 1 });
    const inserted = await new D1NotificationRepository(db).insertIfAbsent(record());
    expect(inserted).toBe(true);
    expect(statements[0]?.query).toContain(
      "ON CONFLICT (maintenance_task_id, next_due) DO NOTHING",
    );
  });

  it("insertIfAbsent reports false on a duplicate cycle", async () => {
    const { db } = harness({ changes: 0 });
    const inserted = await new D1NotificationRepository(db).insertIfAbsent(record());
    expect(inserted).toBe(false);
  });

  it("lists owner notifications newest-first with a fetch-ahead limit", async () => {
    const { db, statements } = harness({ rows: [] });
    const ownerId = UserId.generate();
    await new D1NotificationRepository(db).listByOwner(ownerId, 20, null);
    expect(statements[0]?.query).toContain("ORDER BY created_at DESC, id DESC");
    expect(statements[0]?.values).toEqual([ownerId, 21]);
  });

  it("counts unread notifications for the owner", async () => {
    const { db, statements } = harness({ first: { count: 4 } });
    const ownerId = UserId.generate();
    const count = await new D1NotificationRepository(db).countUnread(ownerId);
    expect(count).toBe(4);
    expect(statements[0]?.query).toContain("read_at IS NULL");
  });

  it("marks a single owned notification read only when unread", async () => {
    const { db, statements } = harness();
    const id = NotificationId.generate();
    const ownerId = UserId.generate();
    await new D1NotificationRepository(db).markRead(id, ownerId, new Date("2026-07-14T00:00:00Z"));
    expect(statements[0]?.query).toContain("WHERE id = ? AND owner_id = ? AND read_at IS NULL");
  });
});
