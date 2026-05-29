import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { AssetId, ValidationError, DomainError } from "@snaveevans/pineapple-shared";
import type { User } from "./domain/identity/User.ts";
import type { Asset } from "./domain/asset/Asset.ts";
import type { AssetMetadata } from "./domain/asset/AssetMetadata.ts";

// Infrastructure
import { D1UserRepository } from "./infrastructure/persistence/D1UserRepository.ts";
import { D1AssetRepository } from "./infrastructure/persistence/D1AssetRepository.ts";
import { createAuth, type Auth, type AuthEnv } from "./infrastructure/auth/auth.ts";
import { BetterAuthResolver } from "./infrastructure/auth/BetterAuthResolver.ts";

// Application
import { CreateAsset } from "./application/usecases/CreateAsset.ts";
import { GetAsset } from "./application/usecases/GetAsset.ts";
import { ListAssets } from "./application/usecases/ListAssets.ts";

// API layer
import { toHttpError } from "./api/errors.ts";
import { CreateAssetBodySchema } from "./api/schemas/assetSchemas.ts";

type Bindings = AuthEnv & {
  /** Local dev only — set in .dev.vars, never in wrangler.toml. Bypasses the Better Auth session check. */
  DEV_AUTH_EMAIL?: string;
};
type Variables = { user: User; auth: Auth };

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

// CORS for the Better Auth endpoints (browser hits these with credentials).
// Reflect the request origin for now — tighten to the deployed web origin
// once the UI lands.
app.use(
  "/api/auth/**",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

// Build a per-request Better Auth instance (baseURL must match the incoming
// origin for OAuth callbacks/cookies to work) and stash it on the context.
app.use("*", async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  await next();
});

// Mount all Better Auth routes: sign-in/out, OAuth callbacks, session, etc.
// e.g. GET /api/auth/sign-in/social?provider=google
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// Auth gate for the application API. Resolves (and JIT-provisions) the domain
// User from the Better Auth session; maps auth failures to clean HTTP errors.
app.use("/api/*", async (c, next) => {
  const resolver = new BetterAuthResolver(
    c.get("auth"),
    new D1UserRepository(c.env.DB),
    c.env.DEV_AUTH_EMAIL,
  );
  try {
    const user = await resolver.resolve(c.req.raw);
    c.set("user", user);
  } catch (e) {
    // Cast to the base Context: this middleware's generic Input is `any`,
    // which `no-unsafe-argument` rejects; toHttpError only needs the base type.
    if (e instanceof DomainError) return toHttpError(c as Context, e);
    throw e;
  }
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
