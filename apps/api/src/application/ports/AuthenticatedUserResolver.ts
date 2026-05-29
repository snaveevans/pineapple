import type { User } from "../../domain/identity/User.ts";

/**
 * Port: resolves the authenticated caller from an incoming request.
 * Implemented by CloudflareAccessResolver in infrastructure/.
 * Throws InvariantError (→ 500) if resolution fails — this signals
 * platform misconfiguration, not a user error.
 */
export interface AuthenticatedUserResolver {
  resolve(request: Request): Promise<User>;
}
