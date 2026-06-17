import { z } from "@hono/zod-openapi";
import { DateOnlySchema } from "./shared.ts";

const AssetTypeSchema = z
  .enum(["vehicle", "property", "equipment"])
  .openapi({ example: "vehicle" });

const IntervalUnitSchema = z.enum(["day", "week", "month", "year"]).openapi({ example: "month" });

const TaskUrgencyStatusSchema = z
  .enum(["overdue", "soon", "ok"])
  .openapi({
    example: "soon",
    description: "Derived from nextDue and todayUtc using calendar-day rules",
  });

export const DashboardFleetTotalsSchema = z
  .object({
    total: z.number().int().nonnegative().openapi({ example: 6 }),
    vehicle: z.number().int().nonnegative().openapi({ example: 2 }),
    equipment: z.number().int().nonnegative().openapi({ example: 2 }),
    property: z.number().int().nonnegative().openapi({ example: 2 }),
  })
  .openapi("DashboardFleetTotals");

export const DashboardFleetHealthSchema = z
  .object({
    overdue: z.number().int().nonnegative().openapi({ example: 1 }),
    soon: z.number().int().nonnegative().openapi({ example: 2 }),
    onTrack: z.number().int().nonnegative().openapi({ example: 2 }),
    unscheduled: z.number().int().nonnegative().openapi({ example: 1 }),
  })
  .openapi("DashboardFleetHealth");

export const DashboardQueueItemSchema = z
  .object({
    taskId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    taskTitle: z.string().openapi({ example: "Oil change + tire rotation" }),
    nextDue: DateOnlySchema,
    status: TaskUrgencyStatusSchema,
    intervalValue: z.number().int().openapi({ example: 3 }),
    intervalUnit: IntervalUnitSchema,
    lastCompletedDate: DateOnlySchema.nullable().openapi({ example: "2026-03-14" }),
    createdAt: z.string().datetime().openapi({ example: "2026-01-15T12:00:00.000Z" }),
    assetId: z.string().uuid().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    assetName: z.string().openapi({ example: "Ford F-150 · Truck #4" }),
    assetType: AssetTypeSchema,
  })
  .openapi("DashboardQueueItem");

export const DashboardResponseSchema = z
  .object({
    viewerDisplayName: z
      .string()
      .nullable()
      .openapi({
        example: "Dale",
        description: "Authenticated user's display name when available",
      }),
    todayUtc: DateOnlySchema.openapi({
      example: "2026-06-16",
      description: "Server-side UTC calendar date used for urgency calculations",
    }),
    fleetTotals: DashboardFleetTotalsSchema,
    fleetHealth: DashboardFleetHealthSchema,
    queue: z.array(DashboardQueueItemSchema),
  })
  .openapi("DashboardResponse");
