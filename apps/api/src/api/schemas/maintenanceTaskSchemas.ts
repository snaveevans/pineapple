import { z } from "@hono/zod-openapi";
import { isValidDateOnly } from "../../domain/maintenance/DateOnly.ts";

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(isValidDateOnly, "Date must be a valid calendar date")
  .openapi({ format: "date", example: "2026-04-11" });

const IntervalUnitSchema = z.enum(["day", "week", "month", "year"]).openapi({ example: "month" });

export const MaintenanceTaskAssetIdParamSchema = z.object({
  assetId: z
    .string()
    .uuid("Asset id must be a UUID")
    .openapi({
      param: { name: "assetId", in: "path" },
      example: "195d0ef0-47f5-439f-abfd-29f892c9a040",
    }),
});

export const MaintenanceTaskParamsSchema = z.object({
  assetId: z
    .string()
    .uuid("Asset id must be a UUID")
    .openapi({
      param: { name: "assetId", in: "path" },
      example: "195d0ef0-47f5-439f-abfd-29f892c9a040",
    }),
  taskId: z
    .string()
    .uuid("Task id must be a UUID")
    .openapi({
      param: { name: "taskId", in: "path" },
      example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    }),
});

export const CreateMaintenanceTaskBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(100, "Title must be 100 characters or fewer")
      .openapi({ example: "Replace furnace filter" }),
    intervalValue: z
      .number()
      .int("Interval value must be an integer")
      .min(1, "Interval value must be at least 1")
      .openapi({ example: 2 }),
    intervalUnit: IntervalUnitSchema,
    lastCompletedDate: DateOnlySchema.optional().openapi({ example: "2026-04-11" }),
  })
  .openapi("CreateMaintenanceTaskBody");

export const MaintenanceTaskResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    assetId: z.string().uuid().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    title: z.string().openapi({ example: "Replace furnace filter" }),
    intervalValue: z.number().int().openapi({ example: 2 }),
    intervalUnit: IntervalUnitSchema,
    lastCompletedDate: z.string().nullable().openapi({ example: "2026-04-11" }),
    nextDue: z.string().openapi({ example: "2026-06-11" }),
    createdAt: z.string().datetime().openapi({ example: "2026-06-11T18:25:24.887Z" }),
  })
  .openapi("MaintenanceTask");

export const MaintenanceTaskListResponseSchema = z
  .object({ maintenanceTasks: z.array(MaintenanceTaskResponseSchema) })
  .openapi("MaintenanceTaskListResponse");
