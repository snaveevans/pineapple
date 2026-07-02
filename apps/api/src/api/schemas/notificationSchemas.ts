import { z } from "@hono/zod-openapi";
import {
  DEFAULT_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
} from "../../application/usecases/ListNotifications.ts";
import { ASSET_TYPES } from "../../domain/asset/AssetType.ts";
import { DateOnlySchema } from "./shared.ts";

export const NotificationQuerySchema = z
  .object({
    cursor: z
      .string()
      .min(1, "Cursor is required")
      .optional()
      .openapi({
        param: { name: "cursor", in: "query" },
        example: "MjAyNi0wNy0xM1QwMDowMDowMC4wMDBafG5vdGlmaWNhdGlvbi0xMjM",
      }),
    limit: z.coerce
      .number()
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(MAX_NOTIFICATION_LIMIT, `Limit must be ${MAX_NOTIFICATION_LIMIT} or fewer`)
      .default(DEFAULT_NOTIFICATION_LIMIT)
      .openapi({
        param: { name: "limit", in: "query" },
        example: DEFAULT_NOTIFICATION_LIMIT,
      }),
  })
  .openapi("NotificationQuery");

export const NotificationIdParamSchema = z
  .object({
    notificationId: z.string().uuid("Notification id must be a UUID").openapi({
      param: { name: "notificationId", in: "path" },
      example: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
    }),
  })
  .openapi("NotificationIdParam");

export const NotificationTypeSchema = z.enum(["maintenance_due_soon"]).openapi({
  example: "maintenance_due_soon",
});

export const NotificationAssetSnapshotSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    name: z.string().openapi({ example: "My Truck" }),
    type: z.enum(ASSET_TYPES).openapi({ example: "vehicle" }),
  })
  .openapi("NotificationAssetSnapshot");

export const NotificationTaskSnapshotSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-4890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "Oil change" }),
    nextDue: DateOnlySchema.openapi({ example: "2026-07-20" }),
  })
  .openapi("NotificationTaskSnapshot");

export const NotificationSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0" }),
    type: NotificationTypeSchema,
    createdAt: z.string().datetime().openapi({ example: "2026-07-13T00:00:00.000Z" }),
    readAt: z.string().datetime().nullable().openapi({ example: null }),
    asset: NotificationAssetSnapshotSchema,
    task: NotificationTaskSnapshotSchema,
  })
  .openapi("Notification");

export const NotificationListResponseSchema = z
  .object({
    notifications: z.array(NotificationSchema),
    unreadCount: z.number().int().nonnegative().openapi({ example: 2 }),
    nextCursor: z.string().nullable().openapi({ example: null }),
  })
  .openapi("NotificationListResponse");

export const MarkAllNotificationsReadResponseSchema = z
  .object({
    unreadCount: z.number().int().nonnegative().openapi({ example: 0 }),
  })
  .openapi("MarkAllNotificationsReadResponse");
