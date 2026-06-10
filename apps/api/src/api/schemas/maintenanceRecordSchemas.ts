import { z } from "@hono/zod-openapi";
import { isValidDateOnly } from "../../domain/maintenance/DateOnly.ts";

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(isValidDateOnly, "Date must be a valid calendar date")
  .openapi({ format: "date", example: "2026-06-09" });

export const MaintenanceAssetIdParamSchema = z.object({
  assetId: z
    .string()
    .uuid("Asset id must be a UUID")
    .openapi({
      param: { name: "assetId", in: "path" },
      example: "195d0ef0-47f5-439f-abfd-29f892c9a040",
    }),
});

export const CreateMaintenanceRecordBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(100, "Title must be 100 characters or fewer")
      .openapi({ example: "Changed oil" }),
    performedAt: DateOnlySchema,
    notes: z
      .string()
      .trim()
      .max(1000, "Notes must be 1000 characters or fewer")
      .optional()
      .openapi({ example: "Used 7 quarts of 5W-20 synthetic oil." }),
  })
  .openapi("CreateMaintenanceRecordBody");

export const MaintenanceRecordResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "e914b960-772f-46a7-b6fb-f333dcfc7fc9" }),
    assetId: z.string().uuid().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    title: z.string().openapi({ example: "Changed oil" }),
    performedAt: DateOnlySchema,
    notes: z.string().nullable().openapi({ example: "Used 7 quarts of synthetic oil." }),
    createdAt: z.string().datetime().openapi({ example: "2026-06-09T18:25:24.887Z" }),
  })
  .openapi("MaintenanceRecord");

export const MaintenanceRecordListResponseSchema = z
  .object({ maintenanceRecords: z.array(MaintenanceRecordResponseSchema) })
  .openapi("MaintenanceRecordListResponse");
