import { Email, InvariantError, UnauthorizedError } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import { UserProvisioned } from "../../domain/identity/events/UserProvisioned.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { AuthenticatedUserResolver } from "../../application/ports/AuthenticatedUserResolver.ts";
import type { EventBus } from "../../application/ports/EventBus.ts";
import type { Auth } from "./auth.ts";

/**
 * Resolves the authenticated caller from a Better Auth session.
 *
 * Better Auth (Google OAuth) owns the session/account tables and is the source
 * of truth for "who is signed in". This resolver bridges that into the domain:
 * it reads the verified session, extracts the email, and just-in-time
 * provisions a domain `User` keyed by email. The two user records stay
 * decoupled — Better Auth's `user` table is auth infrastructure; the domain
 * `users` table is what the rest of the app references.
 *
 * LOCAL DEV: pass `devEmail` (from DEV_AUTH_EMAIL in .dev.vars) to skip the
 * session check entirely. The bypass is honored only when `environment` is
 * exactly "development"; any other configuration fails closed.
 */
export class BetterAuthResolver implements AuthenticatedUserResolver {
  constructor(
    private readonly auth: Auth,
    private readonly users: UserRepository,
    private readonly environment: string | undefined,
    private readonly devEmail?: string,
    private readonly eventBus?: EventBus,
  ) {}

  async resolve(request: Request): Promise<User> {
    const email = await this.#resolveEmail(request);

    let user = await this.users.findByEmail(email);
    if (!user) {
      user = User.create(email);
      await this.users.save(user);
      await this.eventBus?.publish(UserProvisioned({ userId: user.id }));
    }
    return user;
  }

  async #resolveEmail(request: Request): Promise<Email> {
    if (!this.devEmail) return this.#resolveFromSession(request);

    if (this.environment !== "development") {
      throw new InvariantError(
        "DEV_AUTH_EMAIL may only be used when ENVIRONMENT is set to development",
      );
    }

    return Email.from(this.devEmail);
  }

  /** Production: read the verified Better Auth session and extract the email. */
  async #resolveFromSession(request: Request): Promise<Email> {
    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) {
      throw new UnauthorizedError(
        "No active session — sign in via /api/auth/sign-in/social (provider: google)",
      );
    }

    const rawEmail = session.user.email;
    if (typeof rawEmail !== "string" || rawEmail.length === 0) {
      throw new InvariantError("Better Auth session is missing the user email");
    }
    return Email.from(rawEmail);
  }
}
