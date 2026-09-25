import { generateExportedKeyPair } from "better-auth/plugins";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { createAuth, mcpResourceUrl } from "../auth/auth.ts";
import { createMcpTransport } from "./McpTransport.ts";

const baseURL = "https://pineapple.txe.app";
const resource = mcpResourceUrl(baseURL);
const issuer = `${baseURL}/api/auth`;
const keyId = "mcp-test-key";

let privateKey: CryptoKey;
let publicKey: Record<string, unknown>;

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function accessToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "EdDSA", kid: keyId, typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: issuer,
      aud: resource,
      sub: "better-auth-user-id",
      azp: "chatgpt-client",
      scope: "assets:read",
      iat: now,
      exp: now + 300,
      ...overrides,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function mcpRequest(headers?: HeadersInit): Request {
  return new Request(resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
}

function modernMcpRequest(method: string, headers?: HeadersInit): Request {
  return new Request(resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-method": method,
      "mcp-protocol-version": "2026-07-28",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
          [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    }),
  });
}

describe("MCP transport authorization", () => {
  beforeAll(async () => {
    const keys = await generateExportedKeyPair();
    publicKey = keys.publicWebKey;
    privateKey = await crypto.subtle.importKey(
      "jwk",
      keys.privateWebKey as JsonWebKey,
      "Ed25519",
      false,
      ["sign"],
    );
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            keys: [{ ...publicKey, kid: keyId, alg: "EdDSA", use: "sig" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("challenges a request with no bearer token using protected-resource metadata", async () => {
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource);

    const response = await handle(mcpRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("does not accept a Pineapple browser session cookie as MCP authorization", async () => {
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource);

    const response = await handle(
      mcpRequest({ cookie: "better-auth.session_token=browser-session" }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects malformed bearer tokens", async () => {
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource);

    const response = await handle(mcpRequest({ authorization: "Bearer not-a-jwt" }));

    expect(response.status).toBe(401);
  });

  it.each([
    ["expired", { exp: 1 }],
    ["wrong issuer", { iss: "https://attacker.example/api/auth" }],
    ["wrong audience", { aud: "https://pineapple.txe.app/api/assets" }],
  ])("rejects a token with %s claims", async (_case, overrides) => {
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource);

    const response = await handle(
      mcpRequest({ authorization: `Bearer ${await accessToken(overrides)}` }),
    );

    expect(response.status).toBe(401);
  });

  it("returns an insufficient-scope challenge for a valid token without assets:read", async () => {
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource);

    const response = await handle(
      mcpRequest({ authorization: `Bearer ${await accessToken({ scope: "offline_access" })}` }),
    );

    expect(response.status, await response.clone().text()).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(response.headers.get("www-authenticate")).toContain("assets:read");
  });

  it("passes verified token identity into the MCP server factory", async () => {
    const factory = vi.fn().mockReturnValue(new McpServer({ name: "pineapple", version: "1" }));
    const token = await accessToken();
    const handle = createMcpTransport(createAuth(undefined, baseURL), resource, factory);

    const response = await handle(
      modernMcpRequest("server/discover", { authorization: `Bearer ${token}` }),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(factory).toHaveBeenCalledOnce();
    expect(factory.mock.calls[0]?.[0]).toMatchObject({
      era: "modern",
      authInfo: {
        token,
        clientId: "chatgpt-client",
        scopes: ["assets:read"],
        resource: new URL(resource),
        extra: { sub: "better-auth-user-id" },
      },
    });
  });
});
