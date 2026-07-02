import { Email, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { D1VerificationSendLog } from "./D1VerificationSendLog.ts";

type BoundStatement = { query: string; values: unknown[] };

function createHarness(firstResult: unknown = null) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(firstResult),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    },
  }));
  const db = { prepare } as unknown as D1Database;
  return { db, statements };
}

const userId = UserId.generate();
const email = Email.from("contact@example.com");

describe("D1VerificationSendLog", () => {
  it("records a send with a generated id", async () => {
    const { db, statements } = createHarness();

    await new D1VerificationSendLog(db).record({
      userId,
      email,
      purpose: "notification_email",
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(statements[0]?.query).toContain("INSERT INTO email_verification_sends");
    // id (generated), user_id, email, purpose, created_at
    expect(statements[0]?.values).toHaveLength(5);
    expect(statements[0]?.values.slice(1)).toEqual([
      userId,
      "contact@example.com",
      "notification_email",
      "2026-07-02T00:00:00.000Z",
    ]);
  });

  it("returns the latest send timestamp to an address or null", async () => {
    const withRow = createHarness({ latest: "2026-07-02T00:00:00.000Z" });
    const latest = await new D1VerificationSendLog(withRow.db).latestSendToAddress(
      email,
      "notification_email",
    );
    expect(withRow.statements[0]?.query).toContain("MAX(created_at)");
    expect(latest?.toISOString()).toBe("2026-07-02T00:00:00.000Z");

    const empty = createHarness({ latest: null });
    const none = await new D1VerificationSendLog(empty.db).latestSendToAddress(
      email,
      "notification_email",
    );
    expect(none).toBeNull();
  });

  it("counts sends to an address in the window", async () => {
    const { db, statements } = createHarness({ count: 3 });
    const since = new Date("2026-07-01T00:00:00.000Z");

    const count = await new D1VerificationSendLog(db).countSendsToAddressSince(
      email,
      "notification_email",
      since,
    );

    expect(statements[0]?.query).toContain("WHERE email = ? AND purpose = ? AND created_at >= ?");
    expect(statements[0]?.values).toEqual([
      "contact@example.com",
      "notification_email",
      since.toISOString(),
    ]);
    expect(count).toBe(3);
  });

  it("counts sends by a user in the window", async () => {
    const { db, statements } = createHarness({ count: 7 });
    const since = new Date("2026-07-01T00:00:00.000Z");

    const count = await new D1VerificationSendLog(db).countSendsByUserSince(
      userId,
      "notification_email",
      since,
    );

    expect(statements[0]?.query).toContain("WHERE user_id = ? AND purpose = ? AND created_at >= ?");
    expect(statements[0]?.values).toEqual([userId, "notification_email", since.toISOString()]);
    expect(count).toBe(7);
  });
});
