// Route-level tests for the snooze endpoint, driven through the composed app
// so the real middleware chain — auth gate, outbox relay, request telemetry —
// is exercised. Pins the P0 HTTP-edge behaviors from the issue-236 test plan
// that no other test layer can see: 401-before-body-parse, the parser-level
// 400s, the write-gate bypass, and body-only input.
import { addCalendarDays } from "@snaveevans/pineapple-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./worker.ts";

type RouteHandler = {
  match: RegExp;
  rows?: unknown[];
  changes?: number;
};

const ISO = "2026-01-01T00:00:00.000Z";
const userId = "7d914909-c903-41a4-a13a-82cbd0f61851";
const assetId = "195d0ef0-47f5-439f-abfd-29f892c9a040";
const taskId = "b167a794-4469-4765-b540-44f6b11ec676";
const reminderId = "2f5c9a3e-1b7d-4a2e-9c8f-3d6e5b4a7c1d";
const devEmail = "dev@example.com";
const SNOOZE_PATH = `/api/assets/${assetId}/maintenance-tasks/${taskId}/snooze`;

function userRow() {
  return {
    id: userId,
    email: devEmail,
    name: "Dev User",
    onboarding_completed_at: null,
    created_at: ISO,
    notification_email: null,
    notification_email_verified_at: null,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId,
    owner_id: userId,
    name: "Truck",
    type: "vehicle",
    metadata: JSON.stringify({ kind: "vehicle", make: "Ram", model: "2500", year: 2016 }),
    archived_at: null,
    created_at: ISO,
    updated_at: ISO,
    shared_team_id: null,
    ...overrides,
  };
}

function taskRow() {
  return {
    id: taskId,
    asset_id: assetId,
    owner_id: userId,
    title: "Replace furnace filter",
    interval_value: 3,
    interval_unit: "month",
    last_completed_date: "2026-06-01",
    next_due: "2026-09-01",
    created_at: ISO,
    schedule_seed_date: "2026-06-01",
    initial_last_completed_date: "2026-06-01",
    revision: 0,
    next_due_override: null,
  };
}

function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reminderId,
    owner_id: userId,
    actor_id: "system",
    maintenance_task_id: taskId,
    asset_id: assetId,
    asset_name: "Truck",
    asset_type: "vehicle",
    task_title: "Replace furnace filter",
    next_due: "2026-09-01",
    fire_at: "2026-08-25",
    snoozed_until: null,
    status: "pending",
    last_event_id: "evt-1",
    last_event_occurred_at: ISO,
    created_at: ISO,
    updated_at: ISO,
    ...overrides,
  };
}

/**
 * D1 mock that routes by SQL text. Any unmatched query returns empty results —
 * Better Auth's session lookup and the outbox-relay claims both fall through
 * to "nothing found" the way an empty database would.
 */
function mockDb(routes: RouteHandler[] = []) {
  const prepare = vi.fn((sql: string) => {
    const route = routes.find((candidate) => candidate.match.test(sql));
    const rows = route?.rows ?? [];
    return {
      bind: () => ({
        first: vi.fn().mockResolvedValue(rows[0] ?? null),
        all: vi.fn().mockResolvedValue({ results: rows }),
        run: vi.fn().mockResolvedValue({ meta: { changes: route?.changes ?? 0 } }),
      }),
    };
  });
  return {
    db: {
      prepare,
      batch: (statements: { run: () => Promise<unknown> }[]) =>
        Promise.all(statements.map((statement) => statement.run())),
    },
    prepare,
  };
}

function mockDataset() {
  const points: unknown[] = [];
  return { dataset: { writeDataPoint: (point?: unknown) => points.push(point) }, points };
}

function queueMock() {
  return { send: vi.fn(), sendBatch: vi.fn() };
}

const executionCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  abort: () => {},
} as unknown as ExecutionContext;

/**
 * Builds the app env for one scenario. `environment: "production"` disables
 * the DEV_AUTH_EMAIL bypass, so requests carry no session unless a real one
 * is presented (none is).
 */
function buildEnv(
  options: {
    environment?: string;
    gateMode?: string;
    asset?: Record<string, unknown>;
    reminder?: Record<string, unknown>;
  } = {},
) {
  const notificationTelemetry = mockDataset();
  const environment = options.environment ?? "development";
  const db = mockDb([
    { match: /FROM users WHERE (email|id)/, rows: [userRow()] },
    { match: /FROM maintenance_tasks WHERE id/, rows: [taskRow()] },
    { match: /FROM assets WHERE id/, rows: [assetRow(options.asset)] },
    {
      match: /FROM maintenance_write_gate/,
      rows: [{ mode: options.gateMode ?? "open" }],
    },
    { match: /FROM scheduled_reminders/, rows: [reminderRow(options.reminder)] },
    { match: /UPDATE scheduled_reminders/, changes: 1 },
  ]);
  const env = {
    DB: db.db,
    ENVIRONMENT: environment,
    // The dev-auth bypass exists only under ENVIRONMENT=development (the
    // resolver throws InvariantError otherwise), so production-shaped requests
    // genuinely carry no session.
    ...(environment === "development" ? { DEV_AUTH_EMAIL: devEmail } : {}),
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "http://localhost:8787",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    API_REQUEST_TELEMETRY: mockDataset().dataset,
    ASSET_DOMAIN_TELEMETRY: mockDataset().dataset,
    MAINTENANCE_DOMAIN_TELEMETRY: mockDataset().dataset,
    MAINTENANCE_TASK_DOMAIN_TELEMETRY: mockDataset().dataset,
    NOTIFICATION_DOMAIN_TELEMETRY: notificationTelemetry.dataset,
    USER_DOMAIN_TELEMETRY: mockDataset().dataset,
    TEAM_DOMAIN_TELEMETRY: mockDataset().dataset,
    ACTIVITY_HISTORY_QUEUE: queueMock(),
    NOTIFICATION_EVENTS_QUEUE: queueMock(),
    REMINDER_EMAIL_QUEUE: queueMock(),
  };
  return { env: env as unknown as Parameters<typeof app.request>[2], notificationTelemetry };
}

function snoozeRequest(
  env: Parameters<typeof app.request>[2],
  init: { body?: string; contentType?: string | null; path?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.contentType !== null) headers["content-type"] = init.contentType ?? "application/json";
  return Promise.resolve(
    app.request(
      `http://localhost:8787${init.path ?? SNOOZE_PATH}`,
      { method: "POST", headers, ...(init.body !== undefined ? { body: init.body } : {}) },
      env,
      executionCtx,
    ),
  );
}

type SnoozeErrorBody = { error?: string };
type SnoozeOkBody = { taskId: string; snoozedUntil: string };

async function jsonBody<T>(res: Response): Promise<T> {
  const parsed: T = await res.json();
  return parsed;
}

describe("POST .../maintenance-tasks/{taskId}/snooze (route level)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The use case derives snoozedUntil from the real UTC clock; compute the
  // expectation the same way immediately before each request.
  const expectedSnoozedUntil = () => addCalendarDays(new Date().toISOString().slice(0, 10), 1);

  it("returns 401 for a sessionless request with a malformed body — auth precedes body parsing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { env } = buildEnv({ environment: "production" });
    const res = await snoozeRequest(env, { body: "{not json" });

    expect(res.status).toBe(401);
    const body = await jsonBody<SnoozeErrorBody>(res);
    expect(body.error).toContain("No active session");
  });

  it("returns 401 with no session even when the body would otherwise be valid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { env } = buildEnv({ environment: "production" });
    const res = await snoozeRequest(env, { body: '{"durationDays":1}' });

    expect(res.status).toBe(401);
  });

  it("returns 400 (not 422) for malformed JSON from an authenticated caller", async () => {
    const { env } = buildEnv();
    const res = await snoozeRequest(env, { body: "{oops" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty body with a JSON content type", async () => {
    const { env } = buildEnv();
    const res = await snoozeRequest(env, { body: "" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing content type", async () => {
    const { env } = buildEnv();
    const res = await snoozeRequest(env, { body: '{"durationDays":1}', contentType: null });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-JSON content type", async () => {
    const { env } = buildEnv();
    const res = await snoozeRequest(env, {
      body: JSON.stringify({ durationDays: 1 }),
      contentType: "text/plain",
    });

    expect(res.status).toBe(400);
  });

  it("snoozes through the full stack while the maintenance write gate is frozen", async () => {
    // The 503 gate guards maintenance-task storage only; snooze writes
    // notifications-owned state and must still succeed.
    const { env } = buildEnv({ gateMode: "frozen" });
    const res = await snoozeRequest(env, { body: '{"durationDays":1}' });

    expect(res.status).toBe(200);
    const body = await jsonBody<SnoozeOkBody>(res);
    expect(body.taskId).toBe(taskId);
    expect(body.snoozedUntil).toBe(expectedSnoozedUntil());
  });

  it("ignores query-supplied snooze inputs — the body is the only input", async () => {
    const { env } = buildEnv();
    const res = await snoozeRequest(env, {
      body: JSON.stringify({ durationDays: 1 }),
      path: `${SNOOZE_PATH}?durationDays=999&snoozedUntil=2030-01-01`,
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<SnoozeOkBody>(res);
    expect(body.snoozedUntil).toBe(expectedSnoozedUntil());
  });

  it("emits the MaintenanceReminderSnoozed telemetry for an accepted snooze", async () => {
    const { env, notificationTelemetry } = buildEnv();
    const res = await snoozeRequest(env, { body: '{"durationDays":1}' });

    expect(res.status).toBe(200);
    const snoozed = notificationTelemetry.points.find(
      (point): point is { blobs: string[] } =>
        typeof point === "object" &&
        point !== null &&
        "blobs" in point &&
        (point as { blobs: unknown[] }).blobs[0] === "MaintenanceReminderSnoozed",
    );
    expect(snoozed).toBeDefined();
  });
});
