import { DatabaseSync } from "node:sqlite";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { mcp } from "@better-auth/mcp";
import { describe, expect, it } from "vitest";
import { createAuth, mcpResourceUrl } from "./auth.ts";
// @ts-expect-error Vitest's Vite pipeline loads the real migrations as source text.
import betterAuthSchemaSql from "../../../../../migrations/0002_better_auth.sql?raw";
// @ts-expect-error Vitest's Vite pipeline loads the real migrations as source text.
import mcpOAuthProviderSql from "../../../../../migrations/0023_mcp_oauth_provider.sql?raw";

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { eager: true; query: string; import: string },
    ): Record<string, unknown>;
  }
}

const ORIGIN = "https://pineapple.test";
const REDIRECT_URI = "https://client.example/callback";
const TEST_SECRET = "a fixed oauth migration test secret with enough entropy";
const LEGACY_SCOPES = ["assets:read", "offline_access"] as const;
const EXPANDED_SCOPES = [
  "assets:read",
  "maintenance:read",
  "assets:write",
  "maintenance:write",
  "offline_access",
] as const;
const MIGRATION_PATH = "../../../../../migrations/0026_mcp_oauth_client_scopes.sql";
const scopeMigrationModules = import.meta.glob(
  "../../../../../migrations/0026_mcp_oauth_client_scopes.sql",
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);

describe("MCP OAuth legacy client capability migration", () => {
  it("widens only exact legacy public web clients and preserves other client rows", () => {
    const sqlite = createOAuthDatabase();
    seedMigrationClients(sqlite);
    const unchangedIds = [
      "malformed-scopes",
      "different-scopes",
      "disabled-client",
      "skip-consent-client",
      "non-public-client",
      "client-secret-present",
      "client-credentials-client",
      "missing-authorization-code",
      "associated-user-client",
      "non-web-client",
      "pkce-disabled-client",
    ];
    const unchangedRows = new Map(
      unchangedIds.map((clientId) => [clientId, rawClient(sqlite, clientId)]),
    );
    const consentBefore = sqlite
      .prepare('SELECT * FROM "oauthConsent" WHERE "id" = ?')
      .get("untouched-consent");
    const refreshBefore = sqlite
      .prepare('SELECT * FROM "oauthRefreshToken" WHERE "id" = ?')
      .get("untouched-refresh");

    applyScopeMigration(sqlite);

    expect(scopeSet(sqlite, "public-null-pkce")).toEqual([...EXPANDED_SCOPES].sort());
    expect(scopeSet(sqlite, "public-explicit-pkce")).toEqual([...EXPANDED_SCOPES].sort());

    for (const clientId of unchangedIds) {
      expect(rawClient(sqlite, clientId)).toEqual(unchangedRows.get(clientId));
    }

    expect(rawClient(sqlite, "public-null-pkce")).toMatchObject({
      tokenEndpointAuthMethod: "none",
      clientSecret: null,
      applicationType: "web",
      requirePKCE: null,
      skipConsent: null,
      disabled: 0,
      grantTypes: JSON.stringify(["authorization_code", "refresh_token"]),
    });
    expect(rawClient(sqlite, "public-explicit-pkce")).toMatchObject({
      requirePKCE: 1,
      skipConsent: null,
    });
    expect(
      sqlite.prepare('SELECT * FROM "oauthConsent" WHERE "id" = ?').get("untouched-consent"),
    ).toEqual(consentBefore);
    expect(
      sqlite.prepare('SELECT * FROM "oauthRefreshToken" WHERE "id" = ?').get("untouched-refresh"),
    ).toEqual(refreshBefore);
  });

  it("lets an old DCR client renew consent for new capabilities without expanding its old grant", async () => {
    const sqlite = createOAuthDatabase();
    const oldProvider = createAuthWithClientDefaults(sqlite, LEGACY_SCOPES);
    const cookie = await signUp(oldProvider);
    const registration = await registerClient(oldProvider);
    expect(registration.scope.split(" ").sort()).toEqual([...LEGACY_SCOPES].sort());

    const clientId = registration.clientId;
    expect(rawClient(sqlite, clientId)?.scopes).toBe(JSON.stringify(LEGACY_SCOPES));
    const originalVerifier = "J3h4k5m6n7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f";
    const originalToken = await authorizeAndExchange({
      auth: oldProvider,
      cookie,
      clientId,
      scope: LEGACY_SCOPES.join(" "),
      verifier: originalVerifier,
      state: "legacy-grant",
    });
    expect(originalToken.scope.split(" ").sort()).toEqual([...LEGACY_SCOPES].sort());

    const currentProviderBeforeMigration = createCurrentAuth(sqlite);
    const requestedScopes = EXPANDED_SCOPES.filter((scope) => scope !== "offline_access").join(" ");
    const deniedBeforeMigration = await requestAuthorization({
      auth: currentProviderBeforeMigration,
      cookie,
      clientId,
      scope: requestedScopes,
      verifier: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t1w",
      state: "before-migration",
    });
    expectInvalidScopeRedirect(deniedBeforeMigration, "before-migration");

    applyScopeMigration(sqlite);

    const currentProvider = createCurrentAuth(sqlite);
    const unchangedOldRefresh = await refreshToken({
      auth: currentProvider,
      clientId,
      refreshToken: originalToken.refreshToken,
    });
    expect(unchangedOldRefresh.status).toBe(200);
    const unchangedOldTokens = await readJsonObject(unchangedOldRefresh);
    expect(requiredString(unchangedOldTokens.scope).split(" ").sort()).toEqual(
      [...LEGACY_SCOPES].sort(),
    );
    const currentOldRefreshToken = requiredString(unchangedOldTokens.refresh_token);

    const renewedVerifier = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8u9v0w1x";
    const renewedAuthorize = await requestAuthorization({
      auth: currentProvider,
      cookie,
      clientId,
      scope: requestedScopes,
      verifier: renewedVerifier,
      state: "after-migration",
    });
    expect(renewedAuthorize.status).toBe(302);
    const consentLocation = renewedAuthorize.headers.get("location");
    expect(consentLocation).not.toBeNull();
    const consentUrl = new URL(requiredString(consentLocation), ORIGIN);
    expect(consentUrl.pathname).toBe("/oauth/consent");

    const consent = await currentProvider.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ accept: true, oauth_query: consentUrl.searchParams.toString() }),
      }),
    );
    expect(consent.status).toBe(200);
    const consentBody = await readJsonObject(consent);
    const code = new URL(requiredString(consentBody.url)).searchParams.get("code");
    const renewedTokenResponse = await exchangeCode({
      auth: currentProvider,
      clientId,
      code: requiredString(code),
      verifier: renewedVerifier,
    });
    expect(renewedTokenResponse.status).toBe(200);
    const renewedTokens = await readJsonObject(renewedTokenResponse);
    expect(requiredString(renewedTokens.scope).split(" ").sort()).toEqual(
      requestedScopes.split(" ").sort(),
    );

    const oldRefreshUpgrade = await refreshToken({
      auth: currentProvider,
      clientId,
      refreshToken: currentOldRefreshToken,
      scope: requestedScopes,
    });
    expect(oldRefreshUpgrade.status).toBe(400);
    await expect(oldRefreshUpgrade.json()).resolves.toMatchObject({ error: "invalid_scope" });

    const oldRefreshAfterConsent = await refreshToken({
      auth: currentProvider,
      clientId,
      refreshToken: currentOldRefreshToken,
    });
    expect(oldRefreshAfterConsent.status).toBe(200);
    const oldRefreshAfterConsentTokens = await readJsonObject(oldRefreshAfterConsent);
    expect(requiredString(oldRefreshAfterConsentTokens.scope).split(" ").sort()).toEqual(
      [...LEGACY_SCOPES].sort(),
    );
  });
});

function createOAuthDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(betterAuthSchemaSql as string);
  sqlite.exec(mcpOAuthProviderSql as string);
  return sqlite;
}

function createCurrentAuth(sqlite: DatabaseSync) {
  const configured = createAuth(undefined, ORIGIN);
  return betterAuth({
    ...configured.options,
    database: sqlite,
    secret: TEST_SECRET,
    emailAndPassword: { enabled: true },
  });
}

function createAuthWithClientDefaults(sqlite: DatabaseSync, scopes: readonly string[]) {
  const configured = createAuth(undefined, ORIGIN);
  const provider = mcp({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    resource: mcpResourceUrl(ORIGIN),
    scopes: [...scopes],
    grantTypes: ["authorization_code", "refresh_token"],
    accessTokenExpiresIn: 300,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    allowPublicClientPrelogin: true,
    clientRegistrationDefaultScopes: [...scopes],
    clientRegistrationDefaultResources: [mcpResourceUrl(ORIGIN)],
  }) as unknown as BetterAuthPlugin;
  const plugins = (configured.options.plugins ?? []).filter(
    (plugin) => plugin.id !== "oauth-provider",
  );
  return betterAuth({
    ...configured.options,
    database: sqlite,
    secret: TEST_SECRET,
    emailAndPassword: { enabled: true },
    plugins: [...plugins, provider],
  });
}

async function signUp(auth: { handler: (request: Request) => Promise<Response> }): Promise<string> {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "MCP Legacy Scope User",
        email: "mcp-legacy-scope@example.com",
        password: "correct-horse-battery-staple-123",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.join("; ");
}

async function registerClient(auth: {
  handler: (request: Request) => Promise<Response>;
}): Promise<{ clientId: string; scope: string }> {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Legacy field assistant",
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    }),
  );
  expect(response.status).toBe(201);
  const body = await readJsonObject(response);
  return {
    clientId: requiredString(body.client_id),
    scope: requiredString(body.scope),
  };
}

async function authorizeAndExchange(args: {
  auth: { handler: (request: Request) => Promise<Response> };
  cookie: string;
  clientId: string;
  scope: string;
  verifier: string;
  state: string;
}): Promise<{ scope: string; refreshToken: string }> {
  const authorize = await requestAuthorization(args);
  expect(authorize.status).toBe(302);
  const location = authorize.headers.get("location");
  expect(location).not.toBeNull();
  const consentUrl = new URL(requiredString(location), ORIGIN);
  expect(consentUrl.pathname).toBe("/oauth/consent");
  const consent = await args.auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: { cookie: args.cookie, "content-type": "application/json" },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.searchParams.toString() }),
    }),
  );
  expect(consent.status).toBe(200);
  const consentBody = await readJsonObject(consent);
  const code = new URL(requiredString(consentBody.url)).searchParams.get("code");
  const tokenResponse = await exchangeCode({
    auth: args.auth,
    clientId: args.clientId,
    code: requiredString(code),
    verifier: args.verifier,
  });
  expect(tokenResponse.status).toBe(200);
  const tokens = await readJsonObject(tokenResponse);
  return {
    scope: requiredString(tokens.scope),
    refreshToken: requiredString(tokens.refresh_token),
  };
}

async function requestAuthorization(args: {
  auth: { handler: (request: Request) => Promise<Response> };
  cookie: string;
  clientId: string;
  scope: string;
  verifier: string;
  state: string;
}): Promise<Response> {
  const authorizeUrl = new URL(`${ORIGIN}/api/auth/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: args.scope,
    code_challenge: await pkceChallenge(args.verifier),
    code_challenge_method: "S256",
    state: args.state,
  }).toString();
  return args.auth.handler(
    new Request(authorizeUrl, { headers: { cookie: args.cookie, accept: "text/html" } }),
  );
}

async function exchangeCode(args: {
  auth: { handler: (request: Request) => Promise<Response> };
  clientId: string;
  code: string;
  verifier: string;
}): Promise<Response> {
  return args.auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: args.clientId,
        code: args.code,
        redirect_uri: REDIRECT_URI,
        code_verifier: args.verifier,
      }),
    }),
  );
}

async function refreshToken(args: {
  auth: { handler: (request: Request) => Promise<Response> };
  clientId: string;
  refreshToken: string;
  scope?: string;
}): Promise<Response> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: args.clientId,
    refresh_token: args.refreshToken,
  });
  if (args.scope !== undefined) body.set("scope", args.scope);
  return args.auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

function seedMigrationClients(sqlite: DatabaseSync): void {
  sqlite
    .prepare(
      `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       VALUES ('fixture-user', 'Fixture User', 'fixture@example.com', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run();
  const rows: Array<{ clientId: string; options?: Record<string, unknown>; scopes?: string }> = [
    { clientId: "public-null-pkce" },
    { clientId: "public-explicit-pkce", options: { requirePKCE: 1 } },
    { clientId: "malformed-scopes", scopes: '["assets:read", "offline_access"' },
    {
      clientId: "different-scopes",
      scopes: JSON.stringify(["assets:read", "offline_access", "custom:scope"]),
    },
    { clientId: "disabled-client", options: { disabled: 1 } },
    { clientId: "skip-consent-client", options: { skipConsent: 1 } },
    { clientId: "non-public-client", options: { tokenEndpointAuthMethod: "client_secret_basic" } },
    { clientId: "client-secret-present", options: { clientSecret: "stored-secret" } },
    {
      clientId: "client-credentials-client",
      options: { grantTypes: ["authorization_code", "refresh_token", "client_credentials"] },
    },
    { clientId: "missing-authorization-code", options: { grantTypes: ["refresh_token"] } },
    { clientId: "associated-user-client", options: { userId: "fixture-user" } },
    { clientId: "non-web-client", options: { applicationType: "native" } },
    { clientId: "pkce-disabled-client", options: { requirePKCE: 0 } },
  ];
  for (const row of rows) {
    const options = row.options ?? {};
    sqlite
      .prepare(
        `INSERT INTO "oauthClient" (
          "id", "clientId", "clientSecret", "disabled", "skipConsent", "userId", "scopes",
          "redirectUris", "tokenEndpointAuthMethod", "applicationType", "grantTypes", "requirePKCE"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `row-${row.clientId}`,
        row.clientId,
        (options.clientSecret as string | undefined) ?? null,
        (options.disabled as number | undefined) ?? 0,
        (options.skipConsent as number | undefined) ?? null,
        (options.userId as string | undefined) ?? null,
        row.scopes ?? JSON.stringify(LEGACY_SCOPES),
        JSON.stringify([REDIRECT_URI]),
        (options.tokenEndpointAuthMethod as string | undefined) ?? "none",
        (options.applicationType as string | undefined) ?? "web",
        JSON.stringify(options.grantTypes ?? ["authorization_code", "refresh_token"]),
        (options.requirePKCE as number | undefined) ?? null,
      );
  }
  sqlite
    .prepare(
      `INSERT INTO "oauthConsent" ("id", "clientId", "userId", "scopes", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run("untouched-consent", "public-null-pkce", "fixture-user", JSON.stringify(LEGACY_SCOPES));
  sqlite
    .prepare(
      `INSERT INTO "oauthRefreshToken" (
        "id", "token", "clientId", "userId", "expiresAt", "createdAt", "scopes"
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    )
    .run(
      "untouched-refresh",
      "fixture-refresh-token",
      "public-null-pkce",
      "fixture-user",
      "2099-01-01T00:00:00.000Z",
      JSON.stringify(LEGACY_SCOPES),
    );
}

function applyScopeMigration(sqlite: DatabaseSync): void {
  const migration = Object.values(scopeMigrationModules)[0];
  if (typeof migration !== "string") {
    throw new Error(`Expected migration ${MIGRATION_PATH} to be present`);
  }
  sqlite.exec(migration);
}

function expectInvalidScopeRedirect(response: Response, state: string): void {
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const redirect = new URL(requiredString(location));
  expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
  expect(redirect.searchParams.get("error")).toBe("invalid_scope");
  expect(redirect.searchParams.get("state")).toBe(state);
}

function rawClient(sqlite: DatabaseSync, clientId: string): Record<string, unknown> | undefined {
  return sqlite.prepare('SELECT * FROM "oauthClient" WHERE "clientId" = ?').get(clientId);
}

function scopeSet(sqlite: DatabaseSync, clientId: string): string[] {
  const row = rawClient(sqlite, clientId);
  if (row === undefined || typeof row.scopes !== "string") {
    throw new Error(`Expected OAuth client ${clientId} to keep a serialized scope list`);
  }
  const value: unknown = JSON.parse(row.scopes);
  if (!Array.isArray(value) || !value.every((scope) => typeof scope === "string")) {
    throw new Error(`Expected OAuth client ${clientId} scopes to be a string array`);
  }
  return [...value].sort();
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an OAuth response object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string in the OAuth response");
  return value;
}

async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
