import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "./env";
import { logger } from "./lib/logger";
import { requestIdMiddleware } from "./middleware/request-id";
import { createHealthRouter, serviceStatusSchema } from "./routes/health";

const metadata = {
  service: "pineapple-api",
  product: "FieldOps",
} as const;

const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Service"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: serviceStatusSchema,
        },
      },
      description: "Basic API metadata and status.",
    },
  },
});

export const createApp = (): OpenAPIHono<AppEnv> => {
  const app = new OpenAPIHono<AppEnv>();

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

  app.openapi(rootRoute, (c) => {
    return c.json(
      {
        service: metadata.service,
        product: metadata.product,
        status: "ok",
      },
      200,
    );
  });

  app.route("/api/v1", createHealthRouter(metadata));

  app.doc("/doc", (c) => ({
    openapi: "3.0.0",
    info: {
      title: "Pineapple API",
      version: "1.0.0",
      description: "Public OpenAPI document for the Pineapple API.",
    },
    servers: [
      {
        url: "/",
        description: "Current domain",
      },
    ],
  }));

  app.get("/docs", swaggerUI({ url: "/doc" }));

  return app;
};
