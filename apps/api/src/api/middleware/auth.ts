import type { MiddlewareHandler } from "hono";
import type {
  AuthenticatedCaller,
  AuthenticatedUserResolver,
} from "../../application/ports/AuthenticatedUserResolver.ts";
import type { User } from "../../domain/identity/User.ts";

type Variables = { user: User; authCaller: AuthenticatedCaller };

/**
 * Returns a Hono middleware that resolves the authenticated caller via the
 * given resolver and stores the domain user as `c.get("user")` and the full
 * caller context (including provider auth-email verification state) as
 * `c.get("authCaller")`.
 *
 * The resolver is injected at the call site (worker.ts) rather than imported
 * directly, keeping this file layer-compliant: it depends only on the
 * application port interface, not on any infrastructure implementation.
 */
export function createAuthMiddleware(
  resolver: AuthenticatedUserResolver,
): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const caller = await resolver.resolve(c.req.raw);
    c.set("user", caller.user);
    c.set("authCaller", caller);
    await next();
  };
}
