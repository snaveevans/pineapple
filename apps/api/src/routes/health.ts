import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnv } from "../env";

type AppMetadata = {
  product: string;
  service: string;
};

export const serviceStatusSchema = z
  .object({
    service: z.string().openapi({
      example: "pineapple-api",
    }),
    product: z.string().openapi({
      example: "FieldOps",
    }),
    status: z.literal("ok").openapi({
      example: "ok",
    }),
  })
  .openapi("ServiceStatus");

export const healthStatusSchema = serviceStatusSchema
  .extend({
    requestId: z.string().openapi({
      example: "56a6e57d-b632-4513-88e6-6f76d4fe0d23",
    }),
    timestamp: z.iso.datetime().openapi({
      example: "2026-04-29T15:04:05.000Z",
    }),
  })
  .openapi("HealthStatus");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: healthStatusSchema,
        },
      },
      description: "Current API health status.",
    },
  },
});

export const createHealthRouter = (
  metadata: AppMetadata,
): OpenAPIHono<AppEnv> => {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(healthRoute, (c) => {
    return c.json(
      {
        service: metadata.service,
        product: metadata.product,
        status: "ok",
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
      200,
    );
  });

  return router;
};
