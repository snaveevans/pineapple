import { Email, InvariantError, UnauthorizedError } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import { UserProvisioned } from "../../domain/identity/events/UserProvisioned.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type {
  AuthenticatedCaller,
  AuthenticatedUserResolver,
} from "../../application/ports/AuthenticatedUserResolver.ts";
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
 * LOCAL DEV preference:
 * 1. Real session from cookie (if present and valid) — cookie wins.
 * 2. DEV_AUTH_EMAIL bypass from .dev.vars (only if ENVIRONMENT=development).
 * 3. Otherwise the normal no-session UnauthorizedError.
 */
export class BetterAuthResolver implements AuthenticatedUserResolver {
  constructor(
    private readonly auth: Auth,
    private readonly users: UserRepository,
    private readonly environment: string | undefined,
    private readonly devEmail?: string,
    private readonly eventBus?: EventBus,
  ) {}

  async resolve(request: Request): Promise<AuthenticatedCaller> {
    const session = await this.#resolveSession(request);

    let user = await this.users.findByEmail(session.email);
    if (!user) {
      user = User.create(session.email, session.providerName);
      await this.users.save(user);
      await this.eventBus?.publish(UserProvisioned({ userId: user.id }));
    }
    return {
      user,
      providerAuthEmail: session.email,
      providerAuthEmailVerified: session.emailVerified,
    };
  }

  async #resolveSession(request: Request): Promise<{
    email: Email;
    providerName: string | null;
    emailVerified: boolean;
  }> {
    let session: {
      user?: { email?: string; name?: string | null; emailVerified?: boolean };
    } | null = null;
    try {
      session = await this.auth.api.getSession({ headers: request.headers });
    } catch {
      // ignore; treat as no session
    }

    if (session?.user?.email) {
      const raw = session.user.email;
      if (typeof raw === "string" && raw.length > 0) {
        const providerName = typeof session.user.name === "string" ? session.user.name : null;
        const emailVerified = session.user.emailVerified === true;
        return { email: Email.from(raw), providerName, emailVerified };
      }
    }

    const devEmail = this.devEmail?.trim();
    if (devEmail) {
      if (this.environment !== "development") {
        throw new InvariantError(
          "DEV_AUTH_EMAIL may only be used when ENVIRONMENT is set to development",
        );
      }
      // The local dev bypass is a trusted identity, so its auth email is treated
      // as provider-verified — this lets the auto-verify contact-email path be
      // exercised locally without a real OAuth round-trip.
      return { email: Email.from(devEmail), providerName: null, emailVerified: true };
    }

    throw new UnauthorizedError(
      "No active session — sign in via /api/auth/sign-in/social (provider: google)",
    );
  }
}
