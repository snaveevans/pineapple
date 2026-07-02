import { Email, UserId, VerificationTokenId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { VerificationTokenRecord } from "../../application/ports/VerificationTokenRepository.ts";
import { D1VerificationTokenRepository } from "./D1VerificationTokenRepository.ts";

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

function makeRecord(overrides: Partial<VerificationTokenRecord> = {}): VerificationTokenRecord {
  return {
    id: VerificationTokenId.generate(),
    userId,
    email: Email.from("contact@example.com"),
    purpose: "notification_email",
    tokenHash: "hashed-token-value",
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    expiresAt: new Date("2026-07-03T00:00:00.000Z"),
    consumedAt: null,
    ...overrides,
  };
}

describe("D1VerificationTokenRepository", () => {
  it("persists the hash, never the raw token", async () => {
    const { db, statements } = createHarness();
    const record = makeRecord();

    await new D1VerificationTokenRepository(db).save(record);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain("INSERT INTO email_verification_tokens");
    expect(statements[0]?.values).toContain("hashed-token-value");
    expect(statements[0]?.values).toContain("notification_email");
    // consumed_at serialized as null for a fresh token
    expect(statements[0]?.values.at(-1)).toBeNull();
  });

  it("looks a token up by hash and maps the row", async () => {
    const { db, statements } = createHarness({
      id: VerificationTokenId.generate(),
      user_id: userId,
      email: "contact@example.com",
      purpose: "notification_email",
      token_hash: "hashed-token-value",
      created_at: "2026-07-02T00:00:00.000Z",
      expires_at: "2026-07-03T00:00:00.000Z",
      consumed_at: null,
    });

    const found = await new D1VerificationTokenRepository(db).findByHash("hashed-token-value");

    expect(statements[0]?.query).toContain("WHERE token_hash = ?");
    expect(statements[0]?.values).toEqual(["hashed-token-value"]);
    expect(found?.email).toBe("contact@example.com");
    expect(found?.purpose).toBe("notification_email");
    expect(found?.consumedAt).toBeNull();
  });

  it("returns null when the hash is unknown", async () => {
    const { db } = createHarness(null);
    const found = await new D1VerificationTokenRepository(db).findByHash("nope");
    expect(found).toBeNull();
  });

  it("invalidates only outstanding tokens for the scope", async () => {
    const { db, statements } = createHarness();

    await new D1VerificationTokenRepository(db).invalidateOutstanding(
      userId,
      Email.from("contact@example.com"),
      "notification_email",
    );

    const query = statements[0]?.query ?? "";
    expect(query).toContain("UPDATE email_verification_tokens");
    expect(query).toContain("consumed_at IS NULL");
    expect(statements[0]?.values.slice(1)).toEqual([
      userId,
      "contact@example.com",
      "notification_email",
    ]);
  });

  it("consumes a single token by id when not already consumed", async () => {
    const { db, statements } = createHarness();
    const id = VerificationTokenId.generate();
    const consumedAt = new Date("2026-07-02T12:00:00.000Z");

    await new D1VerificationTokenRepository(db).consume(id, consumedAt);

    const query = statements[0]?.query ?? "";
    expect(query).toContain("WHERE id = ? AND consumed_at IS NULL");
    expect(statements[0]?.values).toEqual([consumedAt.toISOString(), id]);
  });
});
