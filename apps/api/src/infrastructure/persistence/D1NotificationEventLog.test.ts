import { MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { D1NotificationEventLog } from "./D1NotificationEventLog.ts";

type BoundStatement = { query: string; values: unknown[] };

function harness(first: unknown = null) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(first),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
    },
  }));
  return { db: { prepare } as unknown as D1Database, statements };
}

describe("D1NotificationEventLog", () => {
  it("reports a processed event as present", async () => {
    const { db } = harness({ present: 1 });
    expect(await new D1NotificationEventLog(db).hasProcessed("evt-1")).toBe(true);
  });

  it("reports an unseen event as absent", async () => {
    const { db } = harness(null);
    expect(await new D1NotificationEventLog(db).hasProcessed("evt-x")).toBe(false);
  });

  it("records a processed event idempotently", async () => {
    const { db, statements } = harness();
    await new D1NotificationEventLog(db).recordProcessed({
      eventId: "evt-1",
      maintenanceTaskId: MaintenanceTaskId.generate(),
      occurredAt: new Date("2026-07-01T00:00:00.000Z"),
      processedAt: new Date("2026-07-01T00:05:00.000Z"),
    });
    expect(statements[0]?.query).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(statements[0]?.values[0]).toBe("evt-1");
  });
});
