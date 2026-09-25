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
      console.error(
        { errorName: error.name, errorMessage: error.message },
        "MCP transport request failed",
      );
    },
  });

  return requireMcpAuth(
    auth,
    (request, claims) =>
      transport.fetch(request, { authInfo: authInfo(request, claims, resource) }),
    {
      resource,
      requiredScopes: [MCP_ASSET_READ_SCOPE],
    },
  );
}
