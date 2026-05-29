import type { Context } from "hono";
import {
  DomainError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "@snaveevans/pineapple-shared";

/**
 * Maps a DomainError to the appropriate HTTP response.
 * Used by all route handlers instead of inline status logic.
 */
export function toHttpError(c: Context, error: DomainError): Response {
  const status =
    error instanceof NotFoundError
      ? 404
      : error instanceof ForbiddenError
        ? 403
        : error instanceof ValidationError
          ? 422
          : error instanceof ConflictError
            ? 409
            : 500;

  const body: Record<string, unknown> = { error: error.message };
  if (error instanceof ValidationError && error.field) {
    body["field"] = error.field;
  }
  return c.json(body, status);
}
