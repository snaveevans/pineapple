import { z } from "@hono/zod-openapi";
import { isValidDateOnly } from "../../domain/maintenance/DateOnly.ts";

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(isValidDateOnly, "Date must be a valid calendar date")
  .openapi({ format: "date", example: "2026-06-09" });
