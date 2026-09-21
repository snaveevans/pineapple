import { describe, expect, it } from "vitest";
import { createAuth, mcpResourceUrl } from "./auth.ts";

describe("MCP OAuth configuration", () => {
  it("binds the MCP protected resource to the public auth origin", () => {
    expect(mcpResourceUrl("https://pineapple.txe.app")).toBe("https://pineapple.txe.app/mcp");
    expect(mcpResourceUrl("http://localhost:5173/")).toBe("http://localhost:5173/mcp");
  });

  it("installs JWT signing before the MCP OAuth provider", () => {
    const configuredAuth = createAuth(undefined, "https://pineapple.txe.app");
    const pluginIds = configuredAuth.options.plugins?.map((plugin) => plugin.id);

    expect(pluginIds).toEqual(expect.arrayContaining(["jwt", "oauth-provider"]));
    expect(pluginIds?.indexOf("jwt")).toBeLessThan(pluginIds?.indexOf("oauth-provider") ?? -1);
  });

  it("publishes protected-resource metadata for the MCP endpoint", async () => {
    const configuredAuth = createAuth(undefined, "https://pineapple.txe.app");

    const response = await configuredAuth.handler(
      new Request("https://pineapple.txe.app/.well-known/oauth-protected-resource/mcp"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://pineapple.txe.app/mcp",
      authorization_servers: ["https://pineapple.txe.app/api/auth"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["assets:read"],
    });
  });

  it("advertises authorization code, PKCE, refresh, registration, and revocation", async () => {
    const configuredAuth = createAuth(undefined, "https://pineapple.txe.app");

    const response = await configuredAuth.handler(
      new Request("https://pineapple.txe.app/.well-known/oauth-authorization-server/api/auth"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "https://pineapple.txe.app/api/auth",
      authorization_endpoint: "https://pineapple.txe.app/api/auth/oauth2/authorize",
      token_endpoint: "https://pineapple.txe.app/api/auth/oauth2/token",
      registration_endpoint: "https://pineapple.txe.app/api/auth/oauth2/register",
      revocation_endpoint: "https://pineapple.txe.app/api/auth/oauth2/revoke",
      scopes_supported: ["assets:read", "offline_access"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("dynamically registers a public ChatGPT client with the narrow defaults", async () => {
    const configuredAuth = createAuth(undefined, "https://pineapple.txe.app");

    const response = await configuredAuth.handler(
      new Request("https://pineapple.txe.app/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "ChatGPT",
          redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "ChatGPT",
      scope: "assets:read offline_access",
      resources: ["https://pineapple.txe.app/mcp"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });
});
