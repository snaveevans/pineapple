import type { AssetType } from "../../domain/asset/AssetType.ts";

/** v1 ships a single notification type. */
export type NotificationType = "maintenance_due_soon";

/** Lifecycle of a scheduled reminder in notifications' own state. */
export type ScheduledReminderStatus = "pending" | "fired" | "canceled" | "superseded";

/** Outcome of an aggregated reminder email batch. */
export type EmailBatchStatus = "pending" | "sent" | "suppressed" | "failed";

/** Why an aggregated email was suppressed (or `none` when it was sent). */
export type EmailSuppressReason = "no_contact_email" | "unverified" | "none";

/** The self-contained asset + task snapshot copied from the enriched event. */
export interface ReminderSnapshot {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  taskTitle: string;
}
