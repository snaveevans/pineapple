import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../env";

const REQUEST_ID_HEADER = "x-request-id";

export const requestIdMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next,
) => {
  const incomingRequestId = c.req.header(REQUEST_ID_HEADER);
  const requestId =
    incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId
      : crypto.randomUUID();

  c.set("requestId", requestId);

  await next();

  c.header(REQUEST_ID_HEADER, requestId);
};
