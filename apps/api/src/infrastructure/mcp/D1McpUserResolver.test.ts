import { describe, expect, it, vi } from "vitest";
import { Email, UnauthorizedError, UserId } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { D1McpUserResolver } from "./D1McpUserResolver.ts";

function domainUser(): User {
  return User.reconstitute({
    id: UserId.generate(),
    email: Email.from("dale@example.com"),
    name: "Dale",
    onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

function harness(authRow: { email: string } | null, user: User | null) {
  const first = vi.fn().mockResolvedValue(authRow);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  const findByEmail = vi.fn().mockResolvedValue(user);
  const users: UserRepository = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    findByEmail,
    save: vi.fn(),
  };
  const resolver = new D1McpUserResolver({ prepare } as unknown as D1Database, users);
  return { resolver, prepare, bind, first, findByEmail };
}

describe("D1McpUserResolver", () => {
  it("maps the verified token subject through Better Auth email to the domain user", async () => {
    const expected = domainUser();
    const { resolver, prepare, bind, findByEmail } = harness(
      { email: "dale@example.com" },
      expected,
    );

    await expect(resolver.resolve("better-auth-user-id")).resolves.toBe(expected);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('FROM "user"'));
    expect(bind).toHaveBeenCalledWith("better-auth-user-id");
    expect(findByEmail).toHaveBeenCalledWith(Email.from("dale@example.com"));
  });

  it.each([undefined, null, "", 42])("rejects an invalid token subject %p", async (subject) => {
    const { resolver, prepare } = harness(null, null);

    await expect(resolver.resolve(subject)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("fails closed when the Better Auth user no longer exists", async () => {
    const { resolver } = harness(null, null);

    await expect(resolver.resolve("deleted-auth-user")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fails closed when consent did not provision the domain user", async () => {
    const { resolver } = harness({ email: "dale@example.com" }, null);

    await expect(resolver.resolve("better-auth-user-id")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
