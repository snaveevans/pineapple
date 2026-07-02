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

  it("continues after an opaque cursor with the stable created-at/id tiebreaker", async () => {
    const { db, statements } = harness({ rows: [] });
    const ownerId = UserId.generate();
    const cursor = btoa("2026-07-13T00:00:00.000Z|notification-123");

    await new D1NotificationRepository(db).listByOwner(ownerId, 20, cursor);

    expect(statements[0]?.query).toContain(
      "AND (created_at < ? OR (created_at = ? AND id < ?))",
    );
    expect(statements[0]?.query).toContain("ORDER BY created_at DESC, id DESC");
    expect(statements[0]?.values).toEqual([
      ownerId,
      "2026-07-13T00:00:00.000Z",
      "2026-07-13T00:00:00.000Z",
      "notification-123",
      21,
    ]);
  });

  it("maps rows with self-contained asset and task snapshots and emits a next cursor", async () => {
    const ownerId = UserId.generate();
    const rowA = row({
      id: "notification-b",
      owner_id: ownerId,
      created_at: "2026-07-14T00:00:00.000Z",
      read_at: null,
    });
    const rowB = row({
      id: "notification-a",
      owner_id: ownerId,
      created_at: "2026-07-13T00:00:00.000Z",
      read_at: "2026-07-15T00:00:00.000Z",
    });
    const { db } = harness({ rows: [rowA, rowB] });

    const page = await new D1NotificationRepository(db).listByOwner(ownerId, 1, null);

    expect(page.notifications).toEqual([
      expect.objectContaining({
        id: NotificationId.from("notification-b"),
        ownerId,
        actorId: "system",
        type: "maintenance_due_soon",
        maintenanceTaskId: MaintenanceTaskId.from(rowA.maintenance_task_id),
        assetId: AssetId.from(rowA.asset_id),
        assetName: "Truck snapshot",
        assetType: "vehicle",
        taskTitle: "Oil change snapshot",
        nextDue: "2026-07-20",
        createdAt: new Date("2026-07-14T00:00:00.000Z"),
        readAt: null,
      }),
    ]);
    expect(page.nextCursor).toBe(btoa("2026-07-14T00:00:00.000Z|notification-b"));
  });

  it("finds a notification only when it belongs to the owner", async () => {
    const ownerId = UserId.generate();
    const id = NotificationId.generate();
    const { db, statements } = harness({
      first: row({
        id,
        owner_id: ownerId,
        read_at: "2026-07-15T00:00:00.000Z",
      }),
    });

    const found = await new D1NotificationRepository(db).findByIdForOwner(id, ownerId);

    expect(statements[0]?.query).toContain("WHERE id = ? AND owner_id = ?");
    expect(statements[0]?.values).toEqual([id, ownerId]);
    expect(found).toEqual(
      expect.objectContaining({
        id,
        ownerId,
        readAt: new Date("2026-07-15T00:00:00.000Z"),
      }),
    );
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

  it("marks all unread notifications for only the owner", async () => {
    const { db, statements } = harness();
    const ownerId = UserId.generate();
    await new D1NotificationRepository(db).markAllRead(ownerId, new Date("2026-07-14T00:00:00Z"));
    expect(statements[0]?.query).toContain("WHERE owner_id = ? AND read_at IS NULL");
    expect(statements[0]?.values).toEqual(["2026-07-14T00:00:00.000Z", ownerId]);
  });
});

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "notification-1",
    owner_id: UserId.generate(),
    actor_id: "system",
    type: "maintenance_due_soon",
    maintenance_task_id: MaintenanceTaskId.generate(),
    asset_id: AssetId.generate(),
    asset_name: "Truck snapshot",
    asset_type: "vehicle",
    task_title: "Oil change snapshot",
    next_due: "2026-07-20",
    created_at: "2026-07-13T00:00:00.000Z",
    read_at: null,
    ...overrides,
  };
}
