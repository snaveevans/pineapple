import { z } from "@hono/zod-openapi";
import { isValidDateOnly } from "../../domain/maintenance/DateOnly.ts";

/**
 * Pinned 422 message for a request body that is valid JSON but not a JSON
 * object (array, string, number, boolean, null). Shared across body-accepting
 * endpoints so clients can match on one string.
 */
export const REQUEST_BODY_NOT_OBJECT = "Request body must be a JSON object.";

/**
 * A strict JSON-object body schema whose non-object payloads fail with the
 * pinned message. Unknown keys and field-level violations still get their own
 * specific Zod messages.
 */
export function jsonObjectBody<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape, {
      error: (issue) => (issue.code === "invalid_type" ? REQUEST_BODY_NOT_OBJECT : undefined),
    })
    .strict();
}

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(isValidDateOnly, "Date must be a valid calendar date")
  .openapi({ format: "date", example: "2026-06-09" });

export const TaskUrgencyStatusSchema = z.enum(["overdue", "soon", "ok"]).openapi({
  example: "soon",
  description: "Derived from nextDue and todayUtc using calendar-day rules",
});
