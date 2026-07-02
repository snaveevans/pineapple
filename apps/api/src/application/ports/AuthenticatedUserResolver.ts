import type { Email } from "@snaveevans/pineapple-shared";
import type { User } from "../../domain/identity/User.ts";

/**
 * The authenticated caller for a request: the domain `User` plus the
 * provider-controlled auth-email context that use cases may need without
 * reaching back into the identity provider directly.
 *
 * `providerAuthEmail` is the email the identity provider authenticated the
 * session with (the same value the domain user is keyed by). `providerAuthEmailVerified`
 * reflects whether the provider asserts that address as verified — the signal
 * the contact-email flow uses to auto-verify a matching notification email.
 */
export interface AuthenticatedCaller {
  user: User;
  providerAuthEmail: Email;
  providerAuthEmailVerified: boolean;
}

/**
 * Port: resolves the authenticated caller from an incoming request.
 * Implemented by BetterAuthResolver in infrastructure/.
 * Throws UnauthorizedError (→ 401) when no valid session is present, or
 * InvariantError (→ 500) on platform misconfiguration.
 */
export interface AuthenticatedUserResolver {
  resolve(request: Request): Promise<AuthenticatedCaller>;
}
