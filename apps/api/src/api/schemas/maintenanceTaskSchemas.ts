import { z } from "@hono/zod-openapi";
import { DateOnlySchema, TaskUrgencyStatusSchema } from "./shared.ts";

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
    lastCompletedDate: DateOnlySchema.nullable().openapi({ example: "2026-04-11" }),
    nextDue: DateOnlySchema.openapi({ example: "2026-06-11" }),
    status: TaskUrgencyStatusSchema,
    daysDue: z.number().int().openapi({
      example: 5,
      description: "Signed calendar-day distance from todayUtc to nextDue; negative means overdue",
    }),
    createdAt: z.string().datetime().openapi({ example: "2026-06-11T18:25:24.887Z" }),
  })
  .openapi("MaintenanceTask");

export const MaintenanceTaskListResponseSchema = z
  .object({ maintenanceTasks: z.array(MaintenanceTaskResponseSchema) })
  .openapi("MaintenanceTaskListResponse");
