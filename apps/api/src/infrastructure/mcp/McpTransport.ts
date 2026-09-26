import { requireMcpAuth } from "@better-auth/mcp";
import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type McpServerFactory,
} from "@modelcontextprotocol/server";
import { MCP_ASSET_READ_SCOPE, type Auth } from "../auth/auth.ts";

const SERVER_INFO = { name: "pineapple", version: "1.0.0" } as const;
type AccessTokenClaims = Record<string, unknown> & {
  scope?: unknown;
  azp?: unknown;
  exp?: unknown;
};

function emptyServer(): McpServer {
  return new McpServer(SERVER_INFO);
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? (token ?? "") : "";
}

function scopesFromClaims(claims: AccessTokenClaims): string[] {
  const scope = claims.scope;
  if (typeof scope === "string") return scope.split(" ").filter(Boolean);
  if (Array.isArray(scope))
    return scope.filter((value): value is string => typeof value === "string");
  return [];
}

function authInfo(request: Request, claims: AccessTokenClaims, resource: string): AuthInfo {
  return {
    token: bearerToken(request),
    clientId: typeof claims.azp === "string" ? claims.azp : "unknown",
    scopes: scopesFromClaims(claims),
    ...(typeof claims.exp === "number" ? { expiresAt: claims.exp } : {}),
    resource: new URL(resource),
    extra: { ...claims },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sanitizeProtocolErrors(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  // The SDK can quote unrecognized input keys before a tool callback runs.
  // Keep our allowlisted domain errors, but replace those protocol diagnostics.
  const body: unknown = await response.clone().json();
  if (!isRecord(body)) return response;
  if (isRecord(body["error"])) {
    body["error"] = {
      code: body["error"]["code"],
      message: "The MCP request could not be processed.",
    };
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(body), { status: response.status, headers });
  }
  const result = body["result"];
  if (!isRecord(result) || result["isError"] !== true) return response;
  const structured = result["structuredContent"];
  if (isRecord(structured) && isRecord(structured["error"])) return response;
  const output = {
    error: {
      code: "INVALID_ARGUMENTS",
      message: "The requested tool or arguments are unavailable or invalid.",
    },
  };
  body["result"] = {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(output) }],
    structuredContent: output,
    ...(result["resultType"] !== undefined ? { resultType: result["resultType"] } : {}),
    ...(result["_meta"] !== undefined ? { _meta: result["_meta"] } : {}),
  };
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

/**
 * Creates Pineapple's stateless, modern MCP request handler.
 *
 * Better Auth owns bearer verification and OAuth challenges. The official MCP
 * SDK owns protocol parsing and creates a fresh server for every request.
 */
export function createMcpTransport(
  auth: Auth,
  resource: string,
  serverFactory: McpServerFactory = emptyServer,
): (request: Request) => Promise<Response> {
  const transport = createMcpHandler(serverFactory, {
    legacy: "reject",
    responseMode: "json",
    onerror: (error) => {
      // Protocol errors may contain submitted property street or private snapshots.
      console.error(
        { errorType: error instanceof Error ? "Error" : "Unknown" },
        "MCP transport request failed",
      );
    },
  });

  return requireMcpAuth(
    auth,
    async (request, claims) =>
      sanitizeProtocolErrors(
        await transport.fetch(request, { authInfo: authInfo(request, claims, resource) }),
      ),
    {
      resource,
      requiredScopes: [MCP_ASSET_READ_SCOPE],
    },
  );
}
