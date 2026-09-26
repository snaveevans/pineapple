import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { withCloudflare } from "better-auth-cloudflare";
import { mcp } from "@better-auth/mcp";

export const MCP_ASSET_READ_SCOPE = "assets:read";
const MCP_OAUTH_SCOPES = [
  MCP_ASSET_READ_SCOPE,
  "maintenance:read",
  "assets:write",
  "maintenance:write",
  "offline_access",
] as const;

export function mcpResourceUrl(baseURL: string): string {
  return new URL("/mcp", baseURL).toString();
}

/**
 * Environment needed to construct a runtime Better Auth instance.
 * Values come from wrangler bindings (`c.env`) — never `process.env`,
 * since this runs on the Workers runtime.
 */
export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /**
   * Explicit Better Auth base URL. REQUIRED in local dev: `wrangler dev` serves
   * the worker under the production `routes` hostname from wrangler.jsonc, so the
   * request URL is NOT localhost. Set this to the Vite origin
   * (`http://localhost:5173`) so OAuth callbacks return through Vite's `/api`
   * development proxy. In production leave it unset; the worker falls back to
   * the request origin (the real public hostname). Better Auth's conventional
   * env var name.
   */
  BETTER_AUTH_URL?: string;
};

/**
 * Builds a Better Auth instance.
 *
 * Dual-mode (per the better-auth-cloudflare docs):
 * - RUNTIME: called with `env` (and the request origin as baseURL) from the
 *   Worker. Uses the native D1 binding via Better Auth's built-in Kysely D1
 *   dialect.
 * - CLI: called with no args by `@better-auth/cli generate` to introspect the
 *   schema. `d1Native` is undefined and secrets are blank — generation only
 *   needs the table/field shape, not a live connection.
 *
 * Better Auth owns its own tables (`user`, `session`, `account`,
 * `verification`) — kept SINGULAR (no `usePlural`) so they do not collide
 * with the domain `users` table. The domain `User` aggregate stays separate
 * and is synced by email in BetterAuthResolver.
 */
export function createAuth(env?: AuthEnv, baseURL?: string) {
  const resolvedBaseURL = baseURL ?? "http://localhost:5173";
  const cloudflareConfig = withCloudflare(
    {
      autoDetectIpAddress: true,
      geolocationTracking: false,
      cf: {},
      // exactOptionalPropertyTypes: only set d1Native when a real binding
      // exists (runtime). Absent in CLI mode so the key is omitted entirely.
      ...(env?.DB ? { d1Native: env.DB } : {}),
    },
    {
      socialProviders: {
        google: {
          clientId: env?.GOOGLE_CLIENT_ID ?? "",
          clientSecret: env?.GOOGLE_CLIENT_SECRET ?? "",
        },
      },
    },
  );

  // @better-auth/oauth-provider@1.7.5 describes one OpenAPI parameter union
  // more narrowly than better-auth@1.7.5's BetterAuthPlugin type. The runtime
  // packages are version-aligned; keep the reconciliation isolated here.
  const mcpPlugin = mcp({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    resource: mcpResourceUrl(resolvedBaseURL),
    scopes: [...MCP_OAUTH_SCOPES],
    grantTypes: ["authorization_code", "refresh_token"],
    // Access JWTs are self-contained. A short lifetime bounds the window
    // after a user revokes the refresh grant while preserving refresh-based
    // mobile connections.
    accessTokenExpiresIn: 300,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Let the consent UI use Better Auth's own signed-query verifier before
    // displaying an actionable grant to a dynamically registered client.
    allowPublicClientPrelogin: true,
    // Registration capabilities are not grants. Every requested scope still
    // requires the user's explicit authorization; existing tokens stay narrow.
    clientRegistrationDefaultScopes: [...MCP_OAUTH_SCOPES],
    clientRegistrationDefaultResources: [mcpResourceUrl(resolvedBaseURL)],
  }) as unknown as BetterAuthPlugin;

  const options: BetterAuthOptions = {
    baseURL: resolvedBaseURL,
    ...(env?.BETTER_AUTH_SECRET ? { secret: env.BETTER_AUTH_SECRET } : {}),
    // Cast: better-auth-cloudflare@0.3.0's plugin endpoint types drift from
    // better-auth@1.6's stricter `Endpoint` index signature (optional R2
    // endpoints we don't use). Runtime is unaffected; this only reconciles
    // the compile-time shape under exactOptionalPropertyTypes.
    ...(cloudflareConfig as BetterAuthOptions),
    plugins: [...((cloudflareConfig as BetterAuthOptions).plugins ?? []), jwt(), mcpPlugin],
  };

  return betterAuth(options);
}

/** Static export consumed by `@better-auth/cli generate` for schema introspection. */
export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
