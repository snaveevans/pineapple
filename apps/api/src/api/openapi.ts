import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AssetIdParamSchema,
  AssetListResponseSchema,
  AssetResponseSchema,
  AssetShareParamSchema,
  CreateAssetBodySchema,
  CreatedAssetResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
} from "./schemas/assetSchemas.ts";
import {
  CreateMaintenanceRecordBodySchema,
  MaintenanceAssetIdParamSchema,
  MaintenanceRecordListResponseSchema,
  MaintenanceRecordResponseSchema,
} from "./schemas/maintenanceRecordSchemas.ts";
import {
  CreateMaintenanceTaskBodySchema,
  MaintenanceTaskAssetIdParamSchema,
  MaintenanceTaskListResponseSchema,
  MaintenanceTaskParamsSchema,
  MaintenanceTaskResponseSchema,
} from "./schemas/maintenanceTaskSchemas.ts";
import { DashboardResponseSchema } from "./schemas/dashboardSchemas.ts";
import { ActivityQuerySchema, ActivityResponseSchema } from "./schemas/activitySchemas.ts";
import { SearchAssetsQuerySchema, SearchAssetsResponseSchema } from "./schemas/searchSchemas.ts";
import {
  SetNotificationEmailBodySchema,
  UpdateUserProfileBodySchema,
  UserProfileResponseSchema,
} from "./schemas/userProfileSchemas.ts";
import {
  ConfirmEmailVerificationBodySchema,
  ConfirmEmailVerificationResponseSchema,
  RequestEmailVerificationResponseSchema,
} from "./schemas/emailVerificationSchemas.ts";
import {
  MarkAllNotificationsReadResponseSchema,
  NotificationIdParamSchema,
  NotificationListResponseSchema,
  NotificationQuerySchema,
  NotificationSchema,
} from "./schemas/notificationSchemas.ts";
import {
  CreateTeamBodySchema,
  MyTeamResponseSchema,
  TeamResponseSchema,
} from "./schemas/teamSchemas.ts";

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
    {
      name: "Maintenance",
      description: "Create and read maintenance records and tasks for assets owned by the caller",
    },
    {
      name: "Users",
      description: "Read and update the authenticated user's domain profile",
    },
    {
      name: "Dashboard",
      description: "Authenticated home-screen read model for fleet health and maintenance queue",
    },
    {
      name: "Activity",
      description: "Authenticated cross-asset history feed",
    },
    {
      name: "Notifications",
      description: "Authenticated durable notification inbox and read lifecycle",
    },
    {
      name: "Teams",
      description: "Create and read the caller's team for sharing assets",
    },
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
  description:
    "Returns the caller's active (non-archived) assets — owned and shared with their team — and category counts over that set. Each asset includes a computed `sharing` descriptor.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "The caller's visible assets",
      content: { "application/json": { schema: AssetListResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getAssetRoute = createRoute({
  method: "get",
  path: "/api/assets/{id}",
  tags: ["Assets"],
  summary: "Get an asset by id",
  description:
    "Returns an asset the caller owns or that is shared with their team, including a computed `sharing` descriptor.",
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
    403: {
      description: "The asset is not visible to the caller",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const searchAssetsRoute = createRoute({
  method: "get",
  path: "/api/search",
  tags: ["Assets"],
  summary: "Search my assets",
  description:
    "Returns up to 20 active assets visible to the caller (owned or shared with their team) that match the free-text query.",
  security: [cookieAuth],
  request: { query: SearchAssetsQuerySchema },
  responses: {
    200: {
      description: "Matching assets",
      content: { "application/json": { schema: SearchAssetsResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    500: {
      description: "Unexpected server error",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const createMaintenanceRecordRoute = createRoute({
  method: "post",
  path: "/api/assets/{assetId}/maintenance-records",
  tags: ["Maintenance"],
  summary: "Create a maintenance record",
  security: [cookieAuth],
  request: {
    params: MaintenanceAssetIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: CreateMaintenanceRecordBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Maintenance record created",
      content: { "application/json": { schema: MaintenanceRecordResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "The asset belongs to another user",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "The asset is archived",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const listMaintenanceRecordsRoute = createRoute({
  method: "get",
  path: "/api/assets/{assetId}/maintenance-records",
  tags: ["Maintenance"],
  summary: "List maintenance records for an asset",
  description:
    "Returns records newest first by performed date, then creation time. Archived asset history remains readable.",
  security: [cookieAuth],
  request: { params: MaintenanceAssetIdParamSchema },
  responses: {
    200: {
      description: "The asset's maintenance records",
      content: { "application/json": { schema: MaintenanceRecordListResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "The asset belongs to another user",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const createMaintenanceTaskRoute = createRoute({
  method: "post",
  path: "/api/assets/{assetId}/maintenance-tasks",
  tags: ["Maintenance"],
  summary: "Create a maintenance task",
  security: [cookieAuth],
  request: {
    params: MaintenanceTaskAssetIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: CreateMaintenanceTaskBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Maintenance task created",
      content: { "application/json": { schema: MaintenanceTaskResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "The asset belongs to another user",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "The asset is archived",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const listMaintenanceTasksRoute = createRoute({
  method: "get",
  path: "/api/assets/{assetId}/maintenance-tasks",
  tags: ["Maintenance"],
  summary: "List maintenance tasks for an asset",
  description:
    "Returns tasks ordered by nextDue ascending (soonest due first). Archived asset tasks remain readable.",
  security: [cookieAuth],
  request: { params: MaintenanceTaskAssetIdParamSchema },
  responses: {
    200: {
      description: "The asset's maintenance tasks",
      content: { "application/json": { schema: MaintenanceTaskListResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "The asset belongs to another user",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getDashboardRoute = createRoute({
  method: "get",
  path: "/api/dashboard",
  tags: ["Dashboard"],
  summary: "Get my dashboard",
  description:
    "Returns fleet totals, maintenance health counts, and the cross-asset maintenance queue for the authenticated user in a single response.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "The caller's dashboard read model",
      content: { "application/json": { schema: DashboardResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getActivityRoute = createRoute({
  method: "get",
  path: "/api/activity",
  tags: ["Activity"],
  summary: "List my activity history",
  description:
    "Returns the caller's durable cross-asset activity feed with server-side filters and cursor pagination.",
  security: [cookieAuth],
  request: { query: ActivityQuerySchema },
  responses: {
    200: {
      description: "The caller's activity read model",
      content: { "application/json": { schema: ActivityResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getUserProfileRoute = createRoute({
  method: "get",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Get my profile",
  description:
    "Returns the authenticated domain user's profile, including email, display name, and onboarding state.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "The caller's profile",
      content: { "application/json": { schema: UserProfileResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const updateUserProfileRoute = createRoute({
  method: "patch",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Update my profile",
  description:
    "Updates the caller's display name. Completes onboarding on the first successful update.",
  security: [cookieAuth],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateUserProfileBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Updated profile",
      content: { "application/json": { schema: UserProfileResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const setNotificationEmailRoute = createRoute({
  method: "put",
  path: "/api/users/me/notification-email",
  tags: ["Users"],
  summary: "Set my contact / notification email",
  description:
    "Stores the caller's contact email. When it matches the provider-verified auth email it is stored verified immediately; otherwise it is stored unverified and a verification email is requested. Returns the updated profile.",
  security: [cookieAuth],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SetNotificationEmailBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Updated profile",
      content: { "application/json": { schema: UserProfileResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Verification send rejected by a rate limit",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const removeNotificationEmailRoute = createRoute({
  method: "delete",
  path: "/api/users/me/notification-email",
  tags: ["Users"],
  summary: "Remove my contact / notification email",
  description:
    "Clears the caller's contact email and its verified state. Idempotent: succeeds with the unchanged profile when none is set. Returns the updated profile.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "Updated profile",
      content: { "application/json": { schema: UserProfileResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const requestEmailVerificationRoute = createRoute({
  method: "post",
  path: "/api/users/me/notification-email/verification",
  tags: ["Users"],
  summary: "Resend my contact-email verification",
  description:
    "Requests a fresh verification email for the caller's current, still-unverified contact email. Subject to per-address cooldown and per-address / per-user daily caps.",
  security: [cookieAuth],
  responses: {
    202: {
      description: "Verification send accepted",
      content: { "application/json": { schema: RequestEmailVerificationResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "No contact email is set to verify",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Rejected by a verification-send rate limit",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const confirmEmailVerificationRoute = createRoute({
  method: "post",
  path: "/api/verify-email",
  tags: ["Users"],
  summary: "Confirm a contact-email verification token",
  description:
    "Public, session-optional endpoint that confirms a verification token from the emailed link. Returns a generic `invalid` outcome for any unknown, expired, used, superseded, or address-changed token without revealing which case applied.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ConfirmEmailVerificationBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Confirmation outcome",
      content: { "application/json": { schema: ConfirmEmailVerificationResponseSchema } },
    },
    422: {
      description: "Malformed request body",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const listNotificationsRoute = createRoute({
  method: "get",
  path: "/api/notifications",
  tags: ["Notifications"],
  summary: "List my notifications",
  description:
    "Returns the caller's durable notification inbox with unread count and cursor pagination. Rows include self-contained asset and task snapshots.",
  security: [cookieAuth],
  request: { query: NotificationQuerySchema },
  responses: {
    200: {
      description: "The caller's notification inbox",
      content: { "application/json": { schema: NotificationListResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const markNotificationReadRoute = createRoute({
  method: "post",
  path: "/api/notifications/{notificationId}/read",
  tags: ["Notifications"],
  summary: "Mark one notification read",
  description:
    "Marks a single caller-owned notification read and returns the updated notification. Unknown or foreign ids return 404.",
  security: [cookieAuth],
  request: { params: NotificationIdParamSchema },
  responses: {
    200: {
      description: "Updated notification",
      content: { "application/json": { schema: NotificationSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such caller-owned notification",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const markAllNotificationsReadRoute = createRoute({
  method: "post",
  path: "/api/notifications/read-all",
  tags: ["Notifications"],
  summary: "Mark all my notifications read",
  description: "Marks all unread notifications owned by the caller read and returns unreadCount.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "Unread count after marking all read",
      content: { "application/json": { schema: MarkAllNotificationsReadResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const deleteMaintenanceTaskRoute = createRoute({
  method: "delete",
  path: "/api/assets/{assetId}/maintenance-tasks/{taskId}",
  tags: ["Maintenance"],
  summary: "Delete a maintenance task",
  description:
    "Permanently removes the task. Linked maintenance records are preserved with taskId set to null.",
  security: [cookieAuth],
  request: { params: MaintenanceTaskParamsSchema },
  responses: {
    204: { description: "Task deleted" },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "The task belongs to another user",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such task",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const shareAssetRoute = createRoute({
  method: "post",
  path: "/api/assets/{assetId}/share",
  tags: ["Assets"],
  summary: "Share an asset to my team",
  description:
    "Shares the asset to the caller's team. Asset-owner only. Idempotent when already shared to that team.",
  security: [cookieAuth],
  request: { params: AssetShareParamSchema },
  responses: {
    200: {
      description: "Asset shared (or already shared)",
      content: { "application/json": { schema: AssetResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Caller is not the asset owner",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Caller does not belong to a team",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const unshareAssetRoute = createRoute({
  method: "delete",
  path: "/api/assets/{assetId}/share",
  tags: ["Assets"],
  summary: "Unshare an asset",
  description: "Returns the asset to personal. Asset-owner only. Idempotent when already personal.",
  security: [cookieAuth],
  request: { params: AssetShareParamSchema },
  responses: {
    200: {
      description: "Asset unshared (or already personal)",
      content: { "application/json": { schema: AssetResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Caller is not the asset owner",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No such asset",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const createTeamRoute = createRoute({
  method: "post",
  path: "/api/teams",
  tags: ["Teams"],
  summary: "Create a team",
  description:
    "Creates a team with the caller as owner and sole member. Fails with 409 if the caller already belongs to a team.",
  security: [cookieAuth],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateTeamBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Team created",
      content: { "application/json": { schema: TeamResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Caller already belongs to a team",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const getMyTeamRoute = createRoute({
  method: "get",
  path: "/api/teams/me",
  tags: ["Teams"],
  summary: "Get my team",
  description:
    "Returns the caller's team with its members, or an explicit null when the caller has no team.",
  security: [cookieAuth],
  responses: {
    200: {
      description: "The caller's team, or null",
      content: { "application/json": { schema: MyTeamResponseSchema } },
    },
    401: {
      description: "Not authenticated",
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
  doc.openapi(searchAssetsRoute, stub);
  doc.openapi(createMaintenanceRecordRoute, stub);
  doc.openapi(listMaintenanceRecordsRoute, stub);
  doc.openapi(createMaintenanceTaskRoute, stub);
  doc.openapi(listMaintenanceTasksRoute, stub);
  doc.openapi(deleteMaintenanceTaskRoute, stub);
  doc.openapi(getDashboardRoute, stub);
  doc.openapi(getActivityRoute, stub);
  doc.openapi(getUserProfileRoute, stub);
  doc.openapi(updateUserProfileRoute, stub);
  doc.openapi(setNotificationEmailRoute, stub);
  doc.openapi(removeNotificationEmailRoute, stub);
  doc.openapi(requestEmailVerificationRoute, stub);
  doc.openapi(confirmEmailVerificationRoute, stub);
  doc.openapi(listNotificationsRoute, stub);
  doc.openapi(markNotificationReadRoute, stub);
  doc.openapi(markAllNotificationsReadRoute, stub);
  doc.openapi(createTeamRoute, stub);
  doc.openapi(getMyTeamRoute, stub);
  doc.openapi(shareAssetRoute, stub);
  doc.openapi(unshareAssetRoute, stub);
  registerOpenApiComponents(doc.openAPIRegistry);
  return doc.getOpenAPIDocument(openApiConfig);
}
