import type { User } from "../../domain/identity/User.ts";

/**
 * Port: resolves the authenticated caller from an incoming request.
 * Implemented by BetterAuthResolver in infrastructure/.
 * Throws UnauthorizedError (→ 401) when no valid session is present, or
 * InvariantError (→ 500) on platform misconfiguration.
 */
export interface AuthenticatedUserResolver {
  resolve(request: Request): Promise<User>;
}
