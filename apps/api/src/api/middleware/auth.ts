import type { MiddlewareHandler } from "hono";
import type { AuthenticatedUserResolver } from "../../application/ports/AuthenticatedUserResolver.ts";
import type { User } from "../../domain/identity/User.ts";

type Variables = { user: User };

/**
 * Returns a Hono middleware that resolves the authenticated user via the
 * given resolver and stores it in the Hono context as `c.get("user")`.
 *
 * The resolver is injected at the call site (worker.ts) rather than imported
 * directly, keeping this file layer-compliant: it depends only on the
 * application port interface, not on any infrastructure implementation.
 */
export function createAuthMiddleware(
  resolver: AuthenticatedUserResolver,
): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const user = await resolver.resolve(c.req.raw);
    c.set("user", user);
    await next();
  };
}
