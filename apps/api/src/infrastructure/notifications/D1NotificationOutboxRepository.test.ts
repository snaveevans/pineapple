import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceTaskCreated } from "../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import { AssetCreated } from "../../domain/asset/events/AssetCreated.ts";
import {
  D1NotificationOutboxRepository,
  prepareNotificationOutboxInsert,
} from "./D1NotificationOutboxRepository.ts";
import { toNotificationEventMessage } from "./NotificationEventMessage.ts";

function createdEvent() {
  return MaintenanceTaskCreated({
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    ownerId: UserId.generate(),
    actorId: UserId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    title: "Oil change",
    intervalValue: 3,
    intervalUnit: "month",
    nextDue: "2026-10-01",
  });
}

describe("prepareNotificationOutboxInsert", () => {
  it("returns an insert for a maintenance-task event", () => {
    const captured: { query: string; values: unknown[] }[] = [];
    const db = {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => {
          captured.push({ query, values });
          return {} as D1PreparedStatement;
        },
      }),
    } as unknown as D1Database;

    const stmt = prepareNotificationOutboxInsert(db, createdEvent());
    expect(stmt).not.toBeNull();
    expect(captured[0]?.query).toContain("INSERT OR IGNORE INTO notification_event_outbox");
    expect(captured[0]?.values).toContain("notification_events");
  });

  it("returns null for an unrelated event", () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    const event = AssetCreated({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Truck",
      assetType: "vehicle",
    });
    expect(prepareNotificationOutboxInsert(db, event)).toBeNull();
  });
});

describe("D1NotificationOutboxRepository.relayPending", () => {
  it.each([false, true])(
    "keeps private queue/database errors out of logs (failure update rejects: %s)",
    async (failureUpdateRejects) => {
      const message = toNotificationEventMessage(createdEvent());
      const statements: { query: string; values: unknown[] }[] = [];
      const batch = failureUpdateRejects
        ? vi.fn().mockRejectedValue(new Error("Database rejected 867 Secret Lane"))
        : vi.fn().mockResolvedValue([]);
      const db = {
        prepare: (query: string) => ({
          bind: (...values: unknown[]) => {
            statements.push({ query, values });
            return {
              all: vi.fn().mockResolvedValue({
                results: [{ id: "evt-1", payload: JSON.stringify(message) }],
              }),
            };
          },
        }),
        batch,
      } as unknown as D1Database;
      const queue = {
        sendBatch: vi.fn().mockRejectedValue(new Error("Queue rejected 867 Secret Lane")),
      } as unknown as Queue<never>;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        await new D1NotificationOutboxRepository(db).relayPending(queue);
        expect(consoleError.mock.calls).toEqual(
          failureUpdateRejects
            ? [["Notification outbox relay failed"], ["Notification outbox failure update failed"]]
            : [["Notification outbox relay failed"]],
        );
        expect(batch).toHaveBeenCalledOnce();
        expect(statements.some(({ query }) => query.includes("SET status = 'pending'"))).toBe(true);
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it("claims pending rows, sends them, and marks them sent", async () => {
    const message = {
      id: "evt-1",
      type: "MaintenanceTaskCreated",
      occurredAt: "2026-09-01T00:00:00.000Z",
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      maintenanceTaskId: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      assetName: "Truck",
      assetType: "vehicle",
      taskTitle: "Oil change",
      nextDue: "2026-10-01",
    };
    const queries: string[] = [];
    const db = {
      prepare: (query: string) => {
        queries.push(query);
        return {
          bind: () => ({
            all: vi
              .fn()
              .mockResolvedValue({ results: [{ id: "evt-1", payload: JSON.stringify(message) }] }),
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          }),
        };
      },
      batch: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database;
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const queue = { sendBatch } as unknown as Queue<never>;

    await new D1NotificationOutboxRepository(db).relayPending(queue);

    expect(sendBatch).toHaveBeenCalledOnce();
    expect(queries.some((q) => q.includes("UPDATE notification_event_outbox"))).toBe(true);
  });
});
