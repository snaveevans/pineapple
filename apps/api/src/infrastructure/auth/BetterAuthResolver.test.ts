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
  sessionName?: string | null;
  sessionEmailVerified?: boolean;
  existingUser?: User;
}) {
  const getSession = vi.fn().mockResolvedValue(
    options.sessionEmail
      ? {
          user: {
            email: options.sessionEmail,
            ...(options.sessionName !== undefined ? { name: options.sessionName } : {}),
            ...(options.sessionEmailVerified !== undefined
              ? { emailVerified: options.sessionEmailVerified }
              : {}),
          },
        }
      : null,
  );
  const findByEmail = vi.fn().mockResolvedValue(options.existingUser ?? null);
  const save = vi.fn().mockResolvedValue(undefined);
  const auth = { api: { getSession } } as unknown as Auth;
  const users = {
    findById: vi.fn().mockResolvedValue(null),
    findByIds: vi.fn().mockResolvedValue([]),
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

    const caller = await resolver.resolve(new Request("http://localhost/api/assets"));

    expect(caller.user.email).toBe(Email.from("dev@example.com"));
    expect(caller.user.name).toBeNull();
    // The trusted local bypass is treated as a provider-verified auth email.
    expect(caller.providerAuthEmail).toBe(Email.from("dev@example.com"));
    expect(caller.providerAuthEmailVerified).toBe(true);
    expect(getSession).toHaveBeenCalledOnce();
    expect(findByEmail).toHaveBeenCalledWith(Email.from("dev@example.com"));
    expect(save).toHaveBeenCalledWith(caller.user);
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

      expect(getSession).toHaveBeenCalledOnce();
      expect(findByEmail).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it.each(["production", "development"])(
    "uses the verified session without DEV_AUTH_EMAIL in %s",
    async (environment) => {
      const existingUser = User.create(Email.from("session@example.com"), "Existing Dale");
      const { resolver, getSession, findByEmail, save } = createHarness({
        environment,
        sessionEmail: "session@example.com",
        sessionName: "New Google Name",
        sessionEmailVerified: true,
        existingUser,
      });

      const resolved = await resolver.resolve(new Request("https://pineapple.example/api/assets"));

      expect(resolved.user).toBe(existingUser);
      expect(resolved.user.name).toBe("Existing Dale");
      expect(resolved.providerAuthEmail).toBe(Email.from("session@example.com"));
      expect(resolved.providerAuthEmailVerified).toBe(true);

      expect(getSession).toHaveBeenCalledOnce();
      expect(findByEmail).toHaveBeenCalledWith(Email.from("session@example.com"));
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("reports the auth email as unverified when the provider does not assert it", async () => {
    const existingUser = User.create(Email.from("session@example.com"), "Existing Dale");
    const { resolver } = createHarness({
      environment: "production",
      sessionEmail: "session@example.com",
      sessionEmailVerified: false,
      existingUser,
    });

    const resolved = await resolver.resolve(new Request("https://pineapple.example/api/assets"));

    expect(resolved.providerAuthEmailVerified).toBe(false);
  });

  it("treats a missing provider emailVerified flag as unverified", async () => {
    const existingUser = User.create(Email.from("session@example.com"), "Existing Dale");
    const { resolver } = createHarness({
      environment: "production",
      sessionEmail: "session@example.com",
      existingUser,
    });

    const resolved = await resolver.resolve(new Request("https://pineapple.example/api/assets"));

    expect(resolved.providerAuthEmailVerified).toBe(false);
  });

  it("copies a trimmed provider name when provisioning a new user", async () => {
    const { resolver, save } = createHarness({
      environment: "production",
      sessionEmail: "new@example.com",
      sessionName: "  Dale  ",
    });

    const caller = await resolver.resolve(new Request("https://pineapple.example/api/assets"));

    expect(caller.user.name).toBe("Dale");
    expect(caller.user.onboardingCompletedAt).toBeNull();
    expect(save).toHaveBeenCalledWith(caller.user);
  });

  it("stores a null name when the provider name is blank", async () => {
    const { resolver, save } = createHarness({
      environment: "production",
      sessionEmail: "new@example.com",
      sessionName: "   ",
    });

    const caller = await resolver.resolve(new Request("https://pineapple.example/api/assets"));

    expect(caller.user.name).toBeNull();
    expect(save).toHaveBeenCalledWith(caller.user);
  });

  it("rejects a request without DEV_AUTH_EMAIL or an active session", async () => {
    const { resolver, getSession, findByEmail, save } = createHarness({
      environment: "production",
    });

    await expect(
      resolver.resolve(new Request("https://pineapple.example/api/assets")),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
