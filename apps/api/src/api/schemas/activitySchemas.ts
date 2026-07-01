import { z } from "@hono/zod-openapi";
import {
  DEFAULT_ACTIVITY_LIMIT,
  MAX_ACTIVITY_LIMIT,
} from "../../application/usecases/ListActivity.ts";
import { ACTIVITY_ENTRY_TYPES } from "../../domain/activity/ActivityEntry.ts";
import { ASSET_TYPES } from "../../domain/asset/AssetType.ts";
import { DateOnlySchema } from "./shared.ts";

export const ActivityEntryTypeSchema = z.enum(ACTIVITY_ENTRY_TYPES).openapi({
  example: "maintenance_logged",
});

export const ActivityQuerySchema = z
  .object({
    type: ActivityEntryTypeSchema.optional().openapi({
      param: { name: "type", in: "query" },
      example: "maintenance_logged",
    }),
    assetId: z
      .string()
      .uuid("Asset id must be a UUID")
      .optional()
      .openapi({
        param: { name: "assetId", in: "query" },
        example: "195d0ef0-47f5-439f-abfd-29f892c9a040",
      }),
    cursor: z
      .string()
      .min(1, "Cursor is required")
      .optional()
      .openapi({
        param: { name: "cursor", in: "query" },
        example: "eyJ2IjoxLCJvY2N1cnJlZEF0IjoiMjAyNi0wNi0wOVQxODowMDowMC4wMDBaIn0",
      }),
    limit: z.coerce
      .number()
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(MAX_ACTIVITY_LIMIT, `Limit must be ${MAX_ACTIVITY_LIMIT} or fewer`)
      .default(DEFAULT_ACTIVITY_LIMIT)
      .openapi({
        param: { name: "limit", in: "query" },
        example: DEFAULT_ACTIVITY_LIMIT,
      }),
  })
  .openapi("ActivityQuery");

export const ActivityAssetSnapshotSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    name: z.string().openapi({ example: "My Truck" }),
    type: z.enum(ASSET_TYPES).openapi({ example: "vehicle" }),
  })
  .openapi("ActivityAssetSnapshot");

export const ActivityEntrySchema = z
  .object({
    id: z.string().uuid().openapi({ example: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0" }),
    type: ActivityEntryTypeSchema,
    occurredAt: z.string().datetime().openapi({ example: "2026-06-09T18:25:24.887Z" }),
    asset: ActivityAssetSnapshotSchema,
    title: z.string().optional().openapi({ example: "Changed oil" }),
    performedAt: DateOnlySchema.optional().openapi({ example: "2026-06-09" }),
  })
  .openapi("ActivityEntry");

export const ActivityTypeFilterSchema = z
  .object({
    type: ActivityEntryTypeSchema,
    count: z.number().int().nonnegative().openapi({ example: 4 }),
  })
  .openapi("ActivityTypeFilter");

export const ActivityAssetFilterSchema = z
  .object({
    asset: ActivityAssetSnapshotSchema,
    count: z.number().int().nonnegative().openapi({ example: 6 }),
  })
  .openapi("ActivityAssetFilter");

export const ActivityAvailableFiltersSchema = z
  .object({
    types: z.array(ActivityTypeFilterSchema),
    assets: z.array(ActivityAssetFilterSchema),
  })
  .openapi("ActivityAvailableFilters");

export const ActivityResponseSchema = z
  .object({
    entries: z.array(ActivityEntrySchema),
    availableFilters: ActivityAvailableFiltersSchema,
    nextCursor: z.string().nullable().openapi({ example: null }),
  })
  .openapi("ActivityResponse");
