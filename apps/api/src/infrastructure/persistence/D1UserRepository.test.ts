import { Email, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { User } from "../../domain/identity/User.ts";
import { D1UserRepository } from "./D1UserRepository.ts";

type BoundStatement = {
  query: string;
  values: unknown[];
};

function createDatabaseHarness(firstResult: unknown = null) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        statements.push({ query, values });
        return {
          first: vi.fn().mockResolvedValue(firstResult),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const db = { prepare } as unknown as D1Database;

  return { db, statements };
}

describe("D1UserRepository", () => {
  it("persists contact-email columns on save", async () => {
    const { db, statements } = createDatabaseHarness();
    const user = User.create(Email.from("dale@example.com"));
    user.setVerifiedNotificationEmail(
      Email.from("contact@example.com"),
      new Date("2026-07-02T12:00:00.000Z"),
    );

    await new D1UserRepository(db).save(user);

    expect(statements).toHaveLength(1);
    const stmt = statements[0];
    expect(stmt?.query).toContain("notification_email");
    expect(stmt?.query).toContain("notification_email_verified_at");
    expect(stmt?.values).toContain("contact@example.com");
    // verified_at is serialized as an ISO string, not left null
    expect(stmt?.values.some((v) => typeof v === "string" && v.includes("T"))).toBe(true);
  });

  it("stores null contact-email columns when no contact email is set", async () => {
    const { db, statements } = createDatabaseHarness();
    const user = User.create(Email.from("dale@example.com"));

    await new D1UserRepository(db).save(user);

    const values = statements[0]?.values ?? [];
    // last two bound params are notification_email and notification_email_verified_at
    expect(values.slice(-2)).toEqual([null, null]);
  });

  it("rehydrates contact-email state from a row", async () => {
    const verifiedAt = "2026-06-01T00:00:00.000Z";
    const { db } = createDatabaseHarness({
      id: UserId.generate(),
      email: "dale@example.com",
      name: "Dale",
      onboarding_completed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      notification_email: "contact@example.com",
      notification_email_verified_at: verifiedAt,
    });

    const user = await new D1UserRepository(db).findById(UserId.generate());

    expect(user?.notificationEmail).toBe("contact@example.com");
    expect(user?.notificationEmailVerifiedAt?.toISOString()).toBe(verifiedAt);
  });
});
