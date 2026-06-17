import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { AssetId, DomainError, MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import type { User } from "./domain/identity/User.ts";
import type { Asset } from "./domain/asset/Asset.ts";
import type { AssetMetadata } from "./domain/asset/AssetMetadata.ts";
import type { MaintenanceRecord } from "./domain/maintenance/MaintenanceRecord.ts";

// Infrastructure
import { D1UserRepository } from "./infrastructure/persistence/D1UserRepository.ts";
import { D1AssetRepository } from "./infrastructure/persistence/D1AssetRepository.ts";
import { D1MaintenanceRecordRepository } from "./infrastructure/persistence/D1MaintenanceRecordRepository.ts";
import { D1MaintenanceTaskRepository } from "./infrastructure/persistence/D1MaintenanceTaskRepository.ts";
import { createAuth, type Auth, type AuthEnv } from "./infrastructure/auth/auth.ts";
import { BetterAuthResolver } from "./infrastructure/auth/BetterAuthResolver.ts";
import { InMemoryEventBus } from "./infrastructure/events/InMemoryEventBus.ts";
import { AnalyticsEngineTelemetrySink } from "./infrastructure/telemetry/AnalyticsEngineTelemetrySink.ts";
import { registerDomainTelemetry } from "./infrastructure/telemetry/registerDomainTelemetry.ts";
import { SystemUtcDateProvider } from "./infrastructure/time/SystemUtcDateProvider.ts";

// Application
import { CreateAsset } from "./application/usecases/CreateAsset.ts";
import { GetAsset } from "./application/usecases/GetAsset.ts";
import { ListAssets } from "./application/usecases/ListAssets.ts";
import { CreateMaintenanceRecord } from "./application/usecases/CreateMaintenanceRecord.ts";
import { ListMaintenanceRecords } from "./application/usecases/ListMaintenanceRecords.ts";
import { CreateMaintenanceTask } from "./application/usecases/CreateMaintenanceTask.ts";
import { ListMaintenanceTasks } from "./application/usecases/ListMaintenanceTasks.ts";
import { DeleteMaintenanceTask } from "./application/usecases/DeleteMaintenanceTask.ts";
import { GetDashboard } from "./application/usecases/GetDashboard.ts";
import { UpdateUserProfile } from "./application/usecases/UpdateUserProfile.ts";
import type { EventBus } from "./application/ports/EventBus.ts";

// API layer
import { toHttpError } from "./api/errors.ts";
import { createTechnicalTelemetryMiddleware } from "./api/middleware/technicalTelemetry.ts";
import {
  createAssetRoute,
  createMaintenanceRecordRoute,
  createMaintenanceTaskRoute,
  deleteMaintenanceTaskRoute,
  getDashboardRoute,
  getUserProfileRoute,
  getAssetRoute,
  healthRoute,
  listAssetsRoute,
  listMaintenanceRecordsRoute,
  listMaintenanceTasksRoute,
  updateUserProfileRoute,
  registerOpenApiComponents,
} from "./api/openapi.ts";
import openApiSpec from "../../../docs/reference/openapi.json";
import type { AssetResponseSchema } from "./api/schemas/assetSchemas.ts";
import type { MaintenanceRecordResponseSchema } from "./api/schemas/maintenanceRecordSchemas.ts";
import type { MaintenanceTaskResponseSchema } from "./api/schemas/maintenanceTaskSchemas.ts";
import type { UserProfileResponseSchema } from "./api/schemas/userProfileSchemas.ts";
import type { MaintenanceTask } from "./domain/maintenance/MaintenanceTask.ts";
import type { z } from "@hono/zod-openapi";

type Bindings = AuthEnv & {
  ENVIRONMENT: string;
  ASSET_DOMAIN_TELEMETRY: AnalyticsEngineDataset;
  MAINTENANCE_DOMAIN_TELEMETRY: AnalyticsEngineDataset;
  MAINTENANCE_TASK_DOMAIN_TELEMETRY: AnalyticsEngineDataset;
  USER_DOMAIN_TELEMETRY: AnalyticsEngineDataset;
  API_REQUEST_TELEMETRY: AnalyticsEngineDataset;
  /** Local dev only; honored only when ENVIRONMENT is exactly "development". */
  DEV_AUTH_EMAIL?: string;
};
type Variables = { user: User; auth: Auth; eventBus: EventBus };
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

app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    // Scalar's /reference UI loads from cdn.jsdelivr.net and emits an inline
    // init script — unsafe-inline/CDN are unavoidable in the v0.10.x adapter.
    // These directives are irrelevant for JSON API responses.
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
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

function serializeMaintenanceRecord(
  record: MaintenanceRecord,
): z.infer<typeof MaintenanceRecordResponseSchema> {
  return {
    id: record.id,
    assetId: record.assetId,
    title: record.title,
    performedAt: record.performedAt,
    notes: record.notes,
    taskId: record.taskId,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeMaintenanceTask(
  task: MaintenanceTask,
): z.infer<typeof MaintenanceTaskResponseSchema> {
  return {
    id: task.id,
    assetId: task.assetId,
    title: task.title,
    intervalValue: task.intervalValue,
    intervalUnit: task.intervalUnit,
    lastCompletedDate: task.lastCompletedDate,
    nextDue: task.nextDue,
    createdAt: task.createdAt.toISOString(),
  };
}

// ── Public routes (no auth) ──────────────────────────────────────────────────

app.openapi(healthRoute, (c) => c.json({ status: "ok" } as const, 200));

// Serve committed spec (app.doc() bakes in epoch date at module init in Workers).
app.get("/openapi.json", (c) => c.json(openApiSpec));
app.get("/reference", Scalar({ url: "/openapi.json" }));

// ── Better Auth ───────────────────────────────────────────────────────────

// Build a per-request Better Auth instance and stash it on the context. The
// baseURL drives OAuth callbacks/cookies, so it must match the public origin.
// Prefer an explicit BETTER_AUTH_URL (required in `wrangler dev`, where the
// request URL is the production route host, not localhost); otherwise derive
// it from the incoming request (correct in production).
app.use("/api/*", async (c, next) => {
  const baseURL = c.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin;
  const auth = createAuth(c.env, baseURL);
  c.set("auth", auth);

  const eventBus = new InMemoryEventBus();
  registerDomainTelemetry({
    eventBus,
    assetDomainDataset: c.env.ASSET_DOMAIN_TELEMETRY,
    maintenanceDomainDataset: c.env.MAINTENANCE_DOMAIN_TELEMETRY,
    maintenanceTaskDomainDataset: c.env.MAINTENANCE_TASK_DOMAIN_TELEMETRY,
    userDomainDataset: c.env.USER_DOMAIN_TELEMETRY,
  });
  c.set("eventBus", eventBus);

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
    c.env.ENVIRONMENT,
    c.env.DEV_AUTH_EMAIL,
    c.get("eventBus"),
  );
  const user = await resolver.resolve(c.req.raw);
  c.set("user", user);
  await next();
});

function serializeUserProfile(user: User): z.infer<typeof UserProfileResponseSchema> {
  return {
    email: user.email,
    name: user.name,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

// ── Dashboard endpoint ───────────────────────────────────────────────────────

app.openapi(getDashboardRoute, async (c) => {
  const user = c.get("user");
  const result = await new GetDashboard(
    new D1AssetRepository(c.env.DB),
    new D1MaintenanceTaskRepository(c.env.DB),
    new SystemUtcDateProvider(),
  ).execute({
    ownerId: user.id,
    viewerDisplayName: user.name,
  });
  if (!result.ok) throw result.error;
  return c.json(result.value, 200);
});

// ── User profile endpoints ───────────────────────────────────────────────────

app.openapi(getUserProfileRoute, (c) => {
  // BetterAuthResolver already hydrated the domain User for this request.
  return c.json(serializeUserProfile(c.get("user")), 200);
});

app.openapi(updateUserProfileRoute, async (c) => {
  const user = c.get("user");
  const { name } = c.req.valid("json");
  const result = await new UpdateUserProfile(
    new D1UserRepository(c.env.DB),
    c.get("eventBus"),
  ).execute({
    userId: user.id,
    name,
  });
  if (!result.ok) throw result.error;
  return c.json(serializeUserProfile(result.value), 200);
});

// ── Asset endpoints ──────────────────────────────────────────────────────────

app.openapi(createAssetRoute, async (c) => {
  const user = c.get("user");
  const { name, metadata } = c.req.valid("json");
  const result = await new CreateAsset(new D1AssetRepository(c.env.DB), c.get("eventBus")).execute({
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

// ── Maintenance record endpoints ────────────────────────────────────────────

app.openapi(createMaintenanceRecordRoute, async (c) => {
  const user = c.get("user");
  const { assetId } = c.req.valid("param");
  const { title, performedAt, notes, taskId } = c.req.valid("json");
  const result = await new CreateMaintenanceRecord(
    new D1AssetRepository(c.env.DB),
    new D1MaintenanceRecordRepository(c.env.DB),
    new D1MaintenanceTaskRepository(c.env.DB),
    c.get("eventBus"),
    new SystemUtcDateProvider(),
  ).execute({
    assetId: AssetId.from(assetId),
    requesterId: user.id,
    title,
    performedAt,
    ...(notes !== undefined ? { notes } : {}),
    ...(taskId !== undefined ? { taskId: MaintenanceTaskId.from(taskId) } : {}),
  });
  if (!result.ok) throw result.error;
  return c.json(serializeMaintenanceRecord(result.value), 201);
});

app.openapi(listMaintenanceRecordsRoute, async (c) => {
  const user = c.get("user");
  const { assetId } = c.req.valid("param");
  const result = await new ListMaintenanceRecords(
    new D1AssetRepository(c.env.DB),
    new D1MaintenanceRecordRepository(c.env.DB),
  ).execute({
    assetId: AssetId.from(assetId),
    requesterId: user.id,
  });
  if (!result.ok) throw result.error;
  return c.json({ maintenanceRecords: result.value.map(serializeMaintenanceRecord) }, 200);
});

// ── Maintenance task endpoints ───────────────────────────────────────────────

app.openapi(createMaintenanceTaskRoute, async (c) => {
  const user = c.get("user");
  const { assetId } = c.req.valid("param");
  const { title, intervalValue, intervalUnit, lastCompletedDate } = c.req.valid("json");
  const result = await new CreateMaintenanceTask(
    new D1AssetRepository(c.env.DB),
    new D1MaintenanceTaskRepository(c.env.DB),
    c.get("eventBus"),
    new SystemUtcDateProvider(),
  ).execute({
    assetId: AssetId.from(assetId),
    requesterId: user.id,
    title,
    intervalValue,
    intervalUnit,
    ...(lastCompletedDate !== undefined ? { lastCompletedDate } : {}),
  });
  if (!result.ok) throw result.error;
  return c.json(serializeMaintenanceTask(result.value), 201);
});

app.openapi(listMaintenanceTasksRoute, async (c) => {
  const user = c.get("user");
  const { assetId } = c.req.valid("param");
  const result = await new ListMaintenanceTasks(
    new D1AssetRepository(c.env.DB),
    new D1MaintenanceTaskRepository(c.env.DB),
  ).execute({
    assetId: AssetId.from(assetId),
    requesterId: user.id,
  });
  if (!result.ok) throw result.error;
  return c.json({ maintenanceTasks: result.value.map(serializeMaintenanceTask) }, 200);
});

app.openapi(deleteMaintenanceTaskRoute, async (c) => {
  const user = c.get("user");
  const { assetId, taskId } = c.req.valid("param");
  const result = await new DeleteMaintenanceTask(
    new D1MaintenanceTaskRepository(c.env.DB),
    c.get("eventBus"),
  ).execute({
    taskId: MaintenanceTaskId.from(taskId),
    assetId: AssetId.from(assetId),
    requesterId: user.id,
  });
  if (!result.ok) throw result.error;
  return c.body(null, 204);
});

export default app;
