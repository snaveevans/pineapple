import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { AssetId, DomainError } from "@snaveevans/pineapple-shared";
import type { User } from "./domain/identity/User.ts";
import type { Asset } from "./domain/asset/Asset.ts";
import type { AssetMetadata } from "./domain/asset/AssetMetadata.ts";

// Infrastructure
import { D1UserRepository } from "./infrastructure/persistence/D1UserRepository.ts";
import { D1AssetRepository } from "./infrastructure/persistence/D1AssetRepository.ts";
import { createAuth, type Auth, type AuthEnv } from "./infrastructure/auth/auth.ts";
import { BetterAuthResolver } from "./infrastructure/auth/BetterAuthResolver.ts";
import { InMemoryEventBus } from "./infrastructure/events/InMemoryEventBus.ts";
import { AnalyticsEngineTelemetrySink } from "./infrastructure/telemetry/AnalyticsEngineTelemetrySink.ts";
import { registerDomainTelemetry } from "./infrastructure/telemetry/registerDomainTelemetry.ts";

// Application
import { CreateAsset } from "./application/usecases/CreateAsset.ts";
import { GetAsset } from "./application/usecases/GetAsset.ts";
import { ListAssets } from "./application/usecases/ListAssets.ts";
import type { EventBus } from "./application/ports/EventBus.ts";

// API layer
import { toHttpError } from "./api/errors.ts";
import { createTechnicalTelemetryMiddleware } from "./api/middleware/technicalTelemetry.ts";
import {
  createAssetRoute,
  getAssetRoute,
  healthRoute,
  listAssetsRoute,
  openApiConfig,
  registerOpenApiComponents,
} from "./api/openapi.ts";
import type { AssetResponseSchema } from "./api/schemas/assetSchemas.ts";
import type { z } from "@hono/zod-openapi";

type Bindings = AuthEnv & {
  ASSET_DOMAIN_TELEMETRY: AnalyticsEngineDataset;
  API_REQUEST_TELEMETRY: AnalyticsEngineDataset;
  /** Local dev only — set in .dev.vars, never in wrangler.toml. Bypasses the Better Auth session check. */
  DEV_AUTH_EMAIL?: string;
};
type Variables = { user: User; auth: Auth };
type AppEnv = { Bindings: Bindings; Variables: Variables };

const app = new OpenAPIHono<AppEnv>({
  // Validation failures (body/params) → 422 in our standard error shape.
  defaultHook: (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.length ? issue.path.join(".") : undefined;
      return c.json(
        { error: issue?.message ?? "Validation failed", ...(field ? { field } : {}) },
        422,
      );
    }
  },
});

// Centralized error handling: domain errors → their HTTP status; anything
// else → 500. Handlers and middleware just `throw` and this maps it.
app.onError((err, c) => {
  if (err instanceof DomainError) return toHttpError(c as Context, err);
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

registerOpenApiComponents(app.openAPIRegistry);

app.use(
  "*",
  createTechnicalTelemetryMiddleware<AppEnv>(
    (c) => new AnalyticsEngineTelemetrySink(c.env.API_REQUEST_TELEMETRY),
  ),
);

// ── Serializers ────────────────────────────────────────────────────────────

function serializeAsset(asset: Asset): z.infer<typeof AssetResponseSchema> {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    metadata: asset.metadata,
    archivedAt: asset.archivedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function createEventBus(c: Context<AppEnv>): EventBus {
  const eventBus = new InMemoryEventBus();
  registerDomainTelemetry({
    eventBus,
    assetDomainDataset: c.env.ASSET_DOMAIN_TELEMETRY,
  });
  return eventBus;
}

// ── Public routes (no auth) ──────────────────────────────────────────────────

app.openapi(healthRoute, (c) => c.json({ status: "ok" } as const, 200));

// Machine-readable spec + interactive docs.
app.doc("/openapi.json", openApiConfig);
app.get("/reference", Scalar({ url: "/openapi.json" }));

// ── Better Auth ───────────────────────────────────────────────────────────

// CORS for the Better Auth endpoints (browser hits these with credentials).
app.use(
  "/api/auth/**",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

// Build a per-request Better Auth instance and stash it on the context. The
// baseURL drives OAuth callbacks/cookies, so it must match the public origin.
// Prefer an explicit BETTER_AUTH_URL (required in `wrangler dev`, where the
// request URL is the production route host, not localhost); otherwise derive
// it from the incoming request (correct in production).
app.use("/api/*", async (c, next) => {
  const baseURL = c.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const auth = createAuth(c.env, baseURL);
  c.set("auth", auth);
  await next();
});

// Mount all Better Auth routes (sign-in/out, OAuth callbacks, session).
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// ── Auth gate for the application API ────────────────────────────────────────

// Resolves (and JIT-provisions) the domain User from the Better Auth session.
// Thrown auth errors propagate to app.onError above.
app.use("/api/*", async (c, next) => {
  const resolver = new BetterAuthResolver(
    c.get("auth"),
    new D1UserRepository(c.env.DB),
    c.env.DEV_AUTH_EMAIL,
  );
  const user = await resolver.resolve(c.req.raw);
  c.set("user", user);
  await next();
});

// ── Asset endpoints ──────────────────────────────────────────────────────────

app.openapi(createAssetRoute, async (c) => {
  const user = c.get("user");
  const { name, metadata } = c.req.valid("json");
  const result = await new CreateAsset(new D1AssetRepository(c.env.DB), createEventBus(c)).execute({
    ownerId: user.id,
    name,
    // Cast: Zod's `.optional()` yields `T | undefined` but the domain type uses
    // exactOptionalPropertyTypes (absent ≠ explicitly undefined).
    metadata: metadata as AssetMetadata,
  });
  if (!result.ok) throw result.error;
  return c.json({ id: result.value }, 201);
});

app.openapi(listAssetsRoute, async (c) => {
  const user = c.get("user");
  const result = await new ListAssets(new D1AssetRepository(c.env.DB)).execute({
    ownerId: user.id,
  });
  if (!result.ok) throw result.error;
  return c.json({ assets: result.value.map(serializeAsset) }, 200);
});

app.openapi(getAssetRoute, async (c) => {
  const user = c.get("user");
  const { id } = c.req.valid("param");
  const result = await new GetAsset(new D1AssetRepository(c.env.DB)).execute({
    assetId: AssetId.from(id),
    requesterId: user.id,
  });
  if (!result.ok) throw result.error;
  return c.json(serializeAsset(result.value), 200);
});

export default app;
