import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AssetIdParamSchema,
  AssetListResponseSchema,
  AssetResponseSchema,
  CreateAssetBodySchema,
  CreatedAssetResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
} from "./schemas/assetSchemas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI route specs (metadata only — no handlers, no infrastructure).
//
// These are the single source of truth for the API contract. worker.ts binds
// real handlers to them via `app.openapi(spec, handler)`; the generate script
// and the runtime `/openapi.json` endpoint both render them. Because there are
// no handlers here, this file stays inside the api-layer boundary (it never
// imports infrastructure).
// ─────────────────────────────────────────────────────────────────────────────

/** Document-level metadata shared by the runtime endpoint and the static file. */
export const openApiConfig = {
  openapi: "3.0.0" as const,
  info: {
    title: "Pineapple API",
    version: "0.1.0",
    description:
      "Field-operations API for managing assets (vehicles, properties, " +
      "equipment). Authentication is handled by Better Auth + Google OAuth; " +
      "send the session cookie obtained from `/api/auth/*` with requests to " +
      "protected `/api/*` routes.",
  },
  servers: [
    { url: "http://localhost:8787", description: "Local dev (wrangler)" },
    {
      url: "https://pineapple-api.tylerjevans.workers.dev",
      description: "Production",
    },
  ],
  tags: [
    { name: "System", description: "Health and meta endpoints" },
    { name: "Assets", description: "Create and read assets owned by the caller" },
  ],
};

const cookieAuth = { cookieAuth: [] as string[] };

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness check",
  description: "Returns ok when the Worker is serving. No authentication.",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});

export const createAssetRoute = createRoute({
  method: "post",
  path: "/api/assets",
  tags: ["Assets"],
  summary: "Create an asset",
  description:
    "Creates an asset owned by the caller. The JSON request body must not exceed 16 KiB.",
  security: [cookieAuth],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateAssetBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Asset created",
      content: { "application/json": { schema: CreatedAssetResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Active asset quota reached",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    413: {
      description: "Request body exceeds 16 KiB",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Write rate limit exceeded",
      headers: {
        "Retry-After": {
          description: "Seconds until the caller should retry",
          schema: { type: "string" },
        },
      },
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const listAssetsRoute = createRoute({
  method: "get",
  path: "/api/assets",
  tags: ["Assets"],
  summary: "List my assets",
  description: "Returns the caller's active (non-archived) assets.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "The caller's assets",
      content: { "application/json": { schema: AssetListResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Read rate limit exceeded",
      headers: {
        "Retry-After": {
          description: "Seconds until the caller should retry",
          schema: { type: "string" },
        },
      },
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getAssetRoute = createRoute({
  method: "get",
  path: "/api/assets/{id}",
  tags: ["Assets"],
  summary: "Get an asset by id",
  security: [cookieAuth],
  request: { params: AssetIdParamSchema },
  responses: {
    200: {
      description: "The asset",
      content: { "application/json": { schema: AssetResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Read rate limit exceeded",
      headers: {
        "Retry-After": {
          description: "Seconds until the caller should retry",
          schema: { type: "string" },
        },
      },
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

/**
 * Register shared OpenAPI components (security schemes) on a registry.
 * Keyed off the registry type (not the app's Env) so it works for both the
 * runtime app and the doc-only builder regardless of their generics.
 */
export function registerOpenApiComponents(registry: OpenAPIHono["openAPIRegistry"]): void {
  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "Better Auth session cookie, set after completing the Google OAuth " +
      "flow at `/api/auth/sign-in/social?provider=google`.",
  });
}

/**
 * Build the OpenAPI document from the route specs alone, with throwaway
 * handlers (never invoked — the doc derives from the specs). Used by the
 * generate script (static file) and re-used by the runtime endpoint, so both
 * render identical output from one source.
 */
export function getApiDocument() {
  const doc = new OpenAPIHono();
  // Handlers are required by `openapi()` but never run during generation.
  const stub = (() => new Response(null, { status: 501 })) as never;
  doc.openapi(healthRoute, stub);
  doc.openapi(createAssetRoute, stub);
  doc.openapi(listAssetsRoute, stub);
  doc.openapi(getAssetRoute, stub);
  registerOpenApiComponents(doc.openAPIRegistry);
  return doc.getOpenAPIDocument(openApiConfig);
}
