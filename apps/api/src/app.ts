import { Hono } from "hono";

import type { AppEnv } from "./env";
import { logger } from "./lib/logger";
import { requestIdMiddleware } from "./middleware/request-id";
import { createHealthRouter } from "./routes/health";

const metadata = {
  service: "pineapple-api",
  product: "FieldOps",
} as const;

export const createApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();

  app.use("*", requestIdMiddleware);
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    const requestId = c.get("requestId");

    logger.info("request.started", {
      method: c.req.method,
      path: c.req.path,
      requestId,
    });

    try {
      await next();
    } catch (error) {
      logger.error("request.failed", {
        method: c.req.method,
        path: c.req.path,
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      logger.info("request.finished", {
        method: c.req.method,
        path: c.req.path,
        requestId,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  app.get("/", (c) => {
    return c.json({
      service: metadata.service,
      product: metadata.product,
      status: "ok",
    });
  });

  app.route("/api/v1", createHealthRouter(metadata));

  return app;
};
