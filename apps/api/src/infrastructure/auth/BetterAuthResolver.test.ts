import { Email, InvariantError, UnauthorizedError } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { Auth } from "./auth.ts";
import { BetterAuthResolver } from "./BetterAuthResolver.ts";

function createHarness(options: {
  environment?: string | undefined;
  devEmail?: string;
  sessionEmail?: string;
  existingUser?: User;
}) {
  const getSession = vi
    .fn()
    .mockResolvedValue(options.sessionEmail ? { user: { email: options.sessionEmail } } : null);
  const findByEmail = vi.fn().mockResolvedValue(options.existingUser ?? null);
  const save = vi.fn().mockResolvedValue(undefined);
  const auth = { api: { getSession } } as unknown as Auth;
  const users = {
    findById: vi.fn().mockResolvedValue(null),
    findByEmail,
    save,
  } satisfies UserRepository;
  const resolver = new BetterAuthResolver(auth, users, options.environment, options.devEmail);

  return { resolver, getSession, findByEmail, save };
}

describe("BetterAuthResolver", () => {
  it("uses DEV_AUTH_EMAIL and provisions the user in development", async () => {
    const { resolver, getSession, findByEmail, save } = createHarness({
      environment: "development",
      devEmail: "Dev@example.com",
    });

    const user = await resolver.resolve(new Request("http://localhost/api/assets"));

    expect(user.email).toBe(Email.from("dev@example.com"));
    expect(getSession).not.toHaveBeenCalled();
    expect(findByEmail).toHaveBeenCalledWith(Email.from("dev@example.com"));
    expect(save).toHaveBeenCalledWith(user);
  });

  it.each([undefined, "production", "staging"])(
    "rejects DEV_AUTH_EMAIL when ENVIRONMENT is %s",
    async (environment) => {
      const { resolver, getSession, findByEmail, save } = createHarness({
        environment,
        devEmail: "dev@example.com",
      });

      await expect(
        resolver.resolve(new Request("https://pineapple.example/api/assets")),
      ).rejects.toBeInstanceOf(InvariantError);

      expect(getSession).not.toHaveBeenCalled();
      expect(findByEmail).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it.each(["production", "development"])(
    "uses the verified session without DEV_AUTH_EMAIL in %s",
    async (environment) => {
      const existingUser = User.create(Email.from("session@example.com"));
      const { resolver, getSession, findByEmail, save } = createHarness({
        environment,
        sessionEmail: "session@example.com",
        existingUser,
      });

      await expect(
        resolver.resolve(new Request("https://pineapple.example/api/assets")),
      ).resolves.toBe(existingUser);

      expect(getSession).toHaveBeenCalledOnce();
      expect(findByEmail).toHaveBeenCalledWith(Email.from("session@example.com"));
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("rejects a request without DEV_AUTH_EMAIL or an active session", async () => {
    const { resolver, getSession, findByEmail, save } = createHarness({
      environment: "production",
    });

    await expect(
      resolver.resolve(new Request("https://pineapple.example/api/assets")),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(getSession).toHaveBeenCalledOnce();
    expect(findByEmail).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
