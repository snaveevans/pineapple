import { Hono } from "hono";

import type { AppEnv } from "../env";

type AppMetadata = {
  product: string;
  service: string;
};

export const createHealthRouter = (metadata: AppMetadata): Hono<AppEnv> => {
  const router = new Hono<AppEnv>();

  router.get("/health", (c) => {
    return c.json({
      service: metadata.service,
      product: metadata.product,
      status: "ok",
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};
