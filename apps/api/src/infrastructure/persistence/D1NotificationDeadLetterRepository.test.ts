import { describe, expect, it, vi } from "vitest";
import { D1NotificationDeadLetterRepository } from "./D1NotificationDeadLetterRepository.ts";

type BoundStatement = { query: string; values: unknown[] };

function harness() {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) };
    },
  }));
  return { db: { prepare } as unknown as D1Database, statements };
}

describe("D1NotificationDeadLetterRepository", () => {
  it("persists a dead letter idempotently by id", async () => {
    const { db, statements } = harness();
    await new D1NotificationDeadLetterRepository(db).save({
      id: "dl-1",
      queue: "pineapple-notification-events-dlq",
      payload: '{"type":"MaintenanceTaskCreated"}',
      error: "handler failed",
      receivedAt: new Date("2026-07-13T00:00:00.000Z"),
    });
    expect(statements[0]?.query).toContain("INSERT INTO notification_dead_letters");
    expect(statements[0]?.query).toContain("ON CONFLICT (id) DO NOTHING");
    expect(statements[0]?.values).toEqual([
      "dl-1",
      "pineapple-notification-events-dlq",
      '{"type":"MaintenanceTaskCreated"}',
      "handler failed",
      "2026-07-13T00:00:00.000Z",
    ]);
  });
});
