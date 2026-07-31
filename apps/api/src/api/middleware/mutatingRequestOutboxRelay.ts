import type { Context, Env, MiddlewareHandler } from "hono";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

/**
 * Relays outbox rows immediately after a successful mutating request, instead
 * of waiting for the next cron sweep. Wire in only the outboxes that should be
 * relayed on the request path — see worker.ts for which ones those are today,
 * and why the notification-email outbox is deliberately not among them
 * (issue #70).
 */
export function createMutatingRequestOutboxRelayMiddleware<TEnv extends Env = Env>(
  getRelayPromises: (c: Context<TEnv>) => readonly Promise<unknown>[],
): MiddlewareHandler<TEnv> {
  return async (c, next) => {
    await next();
    if (c.res.status >= 400 || !MUTATING_METHODS.has(c.req.method)) return;

    for (const relay of getRelayPromises(c)) {
      c.executionCtx.waitUntil(relay);
    }
  };
}
