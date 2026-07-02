import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { EmailBatchRecord } from "../../application/ports/EmailBatchRepository.ts";
import { D1EmailBatchRepository } from "./D1EmailBatchRepository.ts";

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

function record(): EmailBatchRecord {
  return {
    id: EmailBatchId.generate(),
    ownerId: UserId.generate(),
    status: "pending",
    suppressReason: null,
    notificationCount: 3,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
  };
}

describe("D1EmailBatchRepository", () => {
  it("upserts a batch by id", async () => {
    const { db, statements } = harness();
    await new D1EmailBatchRepository(db).save(record());
    expect(statements[0]?.query).toContain("INSERT INTO email_batches");
    expect(statements[0]?.query).toContain("ON CONFLICT (id) DO UPDATE");
    expect(statements[0]?.values).toContain(3);
  });

  it("updates the outcome and suppress reason", async () => {
    const { db, statements } = harness();
    const id = EmailBatchId.generate();
    await new D1EmailBatchRepository(db).updateOutcome(
      id,
      "suppressed",
      "unverified",
      new Date("2026-07-13T01:00:00.000Z"),
    );
    expect(statements[0]?.query).toContain("UPDATE email_batches SET status = ?");
    expect(statements[0]?.values).toEqual([
      "suppressed",
      "unverified",
      "2026-07-13T01:00:00.000Z",
      id,
    ]);
  });
});
