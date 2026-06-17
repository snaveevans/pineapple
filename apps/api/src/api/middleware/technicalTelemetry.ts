import type { Context, MiddlewareHandler } from "hono";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@snaveevans/pineapple-shared";

export type ApiRequestTelemetryDataPoint = {
  indexes: string[];
  blobs: string[];
  doubles: number[];
};

export interface ApiRequestTelemetrySink {
  write(dataPoint: ApiRequestTelemetryDataPoint): void;
}

type TelemetryVariables = {
  user?: unknown;
};

type TelemetryRecord = {
  method: string;
  pathname: string;
  status: number;
  durationMs: number;
  requestSizeBytes: number;
  authenticated: boolean;
  error: unknown;
};

type RouteTelemetry = {
  operation: string;
  routePattern: string;
};

export function createTechnicalTelemetryMiddleware<TEnv extends { Variables: TelemetryVariables }>(
  getSink: (c: Context<TEnv>) => ApiRequestTelemetrySink,
): MiddlewareHandler<TEnv> {
  return async (c, next) => {
    const start = performance.now();
    let error: unknown = null;
    let status = 500;

    try {
      await next();
      status = c.res.status;
    } catch (e) {
      error = e;
      status = statusFromError(e);
      throw e;
    } finally {
      const url = new URL(c.req.url);
      const dataPoint = buildApiRequestTelemetryDataPoint({
        method: c.req.method,
        pathname: url.pathname,
        status,
        durationMs: performance.now() - start,
        requestSizeBytes: requestSizeBytes(c.req.header("content-length")),
        authenticated: c.var.user !== undefined,
        error,
      });

      try {
        getSink(c).write(dataPoint);
      } catch (sinkError) {
        console.error({ error: sinkError }, "API request telemetry write failed");
      }
    }
  };
}

export function buildApiRequestTelemetryDataPoint(
  record: TelemetryRecord,
): ApiRequestTelemetryDataPoint {
  const route = routeTelemetry(record.method, record.pathname);
  return {
    indexes: [route.operation],
    blobs: [
      route.operation,
      route.routePattern,
      record.method,
      statusClass(record.status),
      String(record.status),
      outcome(record.status),
      errorName(record.error),
      record.authenticated ? "true" : "false",
      "v1",
    ],
    doubles: [record.durationMs, 1, record.status, record.requestSizeBytes],
  };
}

function routeTelemetry(method: string, pathname: string): RouteTelemetry {
  if (pathname === "/api/auth/sign-in/social" && method === "POST") {
    return { operation: "SignIn", routePattern: "/api/auth/sign-in/social" };
  }
  if (pathname === "/api/auth/callback/google" && method === "GET") {
    return { operation: "OAuthCallback", routePattern: "/api/auth/callback/google" };
  }
  if (pathname === "/api/auth/get-session" && method === "GET") {
    return { operation: "SessionCheck", routePattern: "/api/auth/get-session" };
  }
  if (pathname === "/api/auth/sign-out" && method === "POST") {
    return { operation: "SignOut", routePattern: "/api/auth/sign-out" };
  }
  if (pathname.startsWith("/api/auth/")) {
    return { operation: "Auth", routePattern: "/api/auth/*" };
  }
  if (pathname === "/api/users/me" && method === "GET") {
    return { operation: "GetUserProfile", routePattern: "/api/users/me" };
  }
  if (pathname === "/api/users/me" && method === "PATCH") {
    return { operation: "UpdateUserProfile", routePattern: "/api/users/me" };
  }
  if (pathname === "/api/assets" && method === "POST") {
    return { operation: "CreateAsset", routePattern: "/api/assets" };
  }
  if (pathname === "/api/assets" && method === "GET") {
    return { operation: "ListAssets", routePattern: "/api/assets" };
  }
  if (/^\/api\/assets\/[^/]+$/.test(pathname) && method === "GET") {
    return { operation: "GetAsset", routePattern: "/api/assets/{id}" };
  }
  if (/^\/api\/assets\/[^/]+\/maintenance-records$/.test(pathname) && method === "POST") {
    return {
      operation: "CreateMaintenanceRecord",
      routePattern: "/api/assets/{assetId}/maintenance-records",
    };
  }
  if (/^\/api\/assets\/[^/]+\/maintenance-records$/.test(pathname) && method === "GET") {
    return {
      operation: "ListMaintenanceRecords",
      routePattern: "/api/assets/{assetId}/maintenance-records",
    };
  }
  if (/^\/api\/assets\/[^/]+\/maintenance-tasks$/.test(pathname) && method === "POST") {
    return {
      operation: "CreateMaintenanceTask",
      routePattern: "/api/assets/{assetId}/maintenance-tasks",
    };
  }
  if (/^\/api\/assets\/[^/]+\/maintenance-tasks$/.test(pathname) && method === "GET") {
    return {
      operation: "ListMaintenanceTasks",
      routePattern: "/api/assets/{assetId}/maintenance-tasks",
    };
  }
  if (/^\/api\/assets\/[^/]+\/maintenance-tasks\/[^/]+$/.test(pathname) && method === "DELETE") {
    return {
      operation: "DeleteMaintenanceTask",
      routePattern: "/api/assets/{assetId}/maintenance-tasks/{taskId}",
    };
  }
  if (pathname === "/health" && method === "GET") {
    return { operation: "Health", routePattern: "/health" };
  }
  if (pathname === "/openapi.json" && method === "GET") {
    return { operation: "OpenApiDocument", routePattern: "/openapi.json" };
  }
  if (pathname === "/reference" && method === "GET") {
    return { operation: "ApiReference", routePattern: "/reference" };
  }
  return { operation: "Unknown", routePattern: "Unknown" };
}

function statusFromError(error: unknown): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof ValidationError) return 422;
  if (error instanceof ConflictError) return 409;
  return 500;
}

function statusClass(status: number): string {
  return `${Math.trunc(status / 100)}xx`;
}

function outcome(status: number): string {
  if (status >= 500) return "error";
  if (status >= 400) return "failure";
  return "success";
}

function errorName(error: unknown): string {
  if (error === null) return "none";
  if (error instanceof Error) return error.constructor.name;
  return "unknown";
}

function requestSizeBytes(contentLength: string | undefined): number {
  if (contentLength === undefined) return 0;
  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
