import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";
import { createAuth } from "./auth.ts";

const ORIGIN = "https://pineapple.test";
const REDIRECT_URI = "https://client.example/callback";

describe("MCP OAuth user grants adversarial contract", () => {
  it("keeps dynamic-registration defaults separate from consent and refuses refresh upgrades", async () => {
    const configuredAuth = createAuth(undefined, ORIGIN);
    const auth = betterAuth({
      ...configuredAuth.options,
      emailAndPassword: { enabled: true },
    });
    const cookie = await signUp(auth);

    const registration = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Field assistant",
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      }),
    );
    expect(registration.status).toBe(201);
    const client = await readJsonObject(registration);
    const clientId = requiredString(client.client_id);
    const registeredScopes = requiredString(client.scope);
    expect(registeredScopes).toContain("assets:write");
    expect(registeredScopes).toContain("maintenance:write");

    const verifier = "J3h4k5m6n7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f";
    const authorizeUrl = new URL(`${ORIGIN}/api/auth/oauth2/authorize`);
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "assets:read offline_access",
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      state: "state-1",
    }).toString();
    const authorize = await auth.handler(
      new Request(authorizeUrl, { headers: { cookie, accept: "text/html" } }),
    );
    expect(authorize.status).toBe(302);
    const consentLocation = authorize.headers.get("location");
    expect(consentLocation).not.toBeNull();
    const signedQuery = new URL(requiredString(consentLocation), ORIGIN).searchParams.toString();

    const consent = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ accept: true, oauth_query: signedQuery }),
      }),
    );
    expect(consent.status).toBe(200);
    const consentBody = await readJsonObject(consent);
    const code = new URL(requiredString(consentBody.url)).searchParams.get("code");

    const tokenResponse = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: requiredString(code),
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const tokens = await readJsonObject(tokenResponse);
    const tokenScope = requiredString(tokens.scope);
    const refreshToken = requiredString(tokens.refresh_token);
    expect(tokenScope.split(" ").sort()).toEqual(["assets:read", "offline_access"]);

    const upgradedRefresh = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken,
          scope: "assets:read assets:write",
        }),
      }),
    );
    expect(upgradedRefresh.status).toBe(400);
    await expect(upgradedRefresh.json()).resolves.toMatchObject({ error: "invalid_scope" });

    const renewedVerifier = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v";
    const renewedAuthorizeUrl = new URL(`${ORIGIN}/api/auth/oauth2/authorize`);
    renewedAuthorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "assets:read assets:write offline_access",
      code_challenge: await pkceChallenge(renewedVerifier),
      code_challenge_method: "S256",
      state: "state-2",
    }).toString();
    const renewedAuthorize = await auth.handler(
      new Request(renewedAuthorizeUrl, { headers: { cookie, accept: "text/html" } }),
    );
    expect(renewedAuthorize.status).toBe(302);
    const renewedConsentLocation = renewedAuthorize.headers.get("location");
    expect(renewedConsentLocation).not.toBeNull();
    expect(new URL(requiredString(renewedConsentLocation), ORIGIN).pathname).toBe("/oauth/consent");

    const renewedConsent = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          accept: true,
          oauth_query: new URL(
            requiredString(renewedConsentLocation),
            ORIGIN,
          ).searchParams.toString(),
        }),
      }),
    );
    expect(renewedConsent.status).toBe(200);
    const renewedConsentBody = await readJsonObject(renewedConsent);
    const renewedCode = new URL(requiredString(renewedConsentBody.url)).searchParams.get("code");
    const renewedTokenResponse = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: requiredString(renewedCode),
          redirect_uri: REDIRECT_URI,
          code_verifier: renewedVerifier,
        }),
      }),
    );
    expect(renewedTokenResponse.status).toBe(200);
    const renewedTokens = await readJsonObject(renewedTokenResponse);
    expect(requiredString(renewedTokens.scope).split(" ").sort()).toEqual([
      "assets:read",
      "assets:write",
      "offline_access",
    ]);
  });
});

async function signUp(auth: { handler: (request: Request) => Promise<Response> }): Promise<string> {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "MCP Test User",
        email: "mcp-oauth-adversarial@example.com",
        password: "correct-horse-battery-staple-123",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.join("; ");
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
