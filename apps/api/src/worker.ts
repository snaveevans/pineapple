import { Hono } from "hono";
import { AssetId, ValidationError } from "@snaveevans/pineapple-shared";
import type { User } from "./domain/identity/User.ts";
import type { Asset } from "./domain/asset/Asset.ts";
import type { AssetMetadata } from "./domain/asset/AssetMetadata.ts";

// Infrastructure
import { D1UserRepository } from "./infrastructure/persistence/D1UserRepository.ts";
import { D1AssetRepository } from "./infrastructure/persistence/D1AssetRepository.ts";
import { CloudflareAccessResolver } from "./infrastructure/auth/CloudflareAccessResolver.ts";

// Application
import { CreateAsset } from "./application/usecases/CreateAsset.ts";
import { GetAsset } from "./application/usecases/GetAsset.ts";
import { ListAssets } from "./application/usecases/ListAssets.ts";

// API layer
import { toHttpError } from "./api/errors.ts";
import { CreateAssetBodySchema } from "./api/schemas/assetSchemas.ts";

type Bindings = {
  DB: D1Database;
  CF_TEAM_DOMAIN: string;
  CF_AUD: string;
  /** Local dev only — set in .dev.vars, never in wrangler.toml. Bypasses CF Access JWT verification. */
  DEV_AUTH_EMAIL?: string;
};
type Variables = { user: User };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Serializers ────────────────────────────────────────────────────────────

function serializeAsset(asset: Asset) {
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

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /health — no auth required
app.get("/health", (c) => c.json({ status: "ok" }));

// Auth middleware applied to all /api/* routes.
// Inlined directly (rather than via createAuthMiddleware) to avoid a Hono
// generic env mismatch between the full AppEnv and the narrower middleware type.
app.use("/api/*", async (c, next) => {
  const resolver = new CloudflareAccessResolver(
    new D1UserRepository(c.env.DB),
    c.env.CF_TEAM_DOMAIN,
    c.env.CF_AUD,
    c.env.DEV_AUTH_EMAIL,
  );
  const user = await resolver.resolve(c.req.raw);
  c.set("user", user);
  await next();
});

// POST /api/assets — create a new asset
app.post("/api/assets", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<unknown>().catch(() => null);
  const parsed = CreateAssetBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return toHttpError(c, new ValidationError(issue?.message ?? "Invalid request body"));
  }
  const result = await new CreateAsset(new D1AssetRepository(c.env.DB)).execute({
    ownerId: user.id,
    name: parsed.data.name,
    // Cast needed: Zod's .optional() produces `T | undefined` but the domain
    // type uses exactOptionalPropertyTypes (absent ≠ explicitly undefined).
    metadata: parsed.data.metadata as AssetMetadata,
  });
  if (!result.ok) return toHttpError(c, result.error);
  return c.json({ id: result.value }, 201);
});

// GET /api/assets — list my assets (active only)
app.get("/api/assets", async (c) => {
  const user = c.get("user");
  const result = await new ListAssets(new D1AssetRepository(c.env.DB)).execute({
    ownerId: user.id,
  });
  if (!result.ok) return toHttpError(c, result.error);
  return c.json({ assets: result.value.map(serializeAsset) });
});

// GET /api/assets/:id — get a single asset by ID
app.get("/api/assets/:id", async (c) => {
  const user = c.get("user");
  const result = await new GetAsset(new D1AssetRepository(c.env.DB)).execute({
    assetId: AssetId.from(c.req.param("id")),
    requesterId: user.id,
  });
  if (!result.ok) return toHttpError(c, result.error);
  return c.json(serializeAsset(result.value));
});

export default app;
