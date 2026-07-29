import { apiGet, apiPost } from "./client.ts";
import type { components, paths } from "./schema.ts";

export type NotificationType = components["schemas"]["Notification"]["type"];
export type NotificationAssetSnapshot = components["schemas"]["NotificationAssetSnapshot"];
export type NotificationTaskSnapshot = components["schemas"]["NotificationTaskSnapshot"];
export type AppNotification = components["schemas"]["Notification"];
export type NotificationListResponse = components["schemas"]["NotificationListResponse"];

export type ListNotificationsParams = NonNullable<
  paths["/api/notifications"]["get"]["parameters"]["query"]
>;

export const notificationsQueryKey = ["notifications"] as const;

export function notificationsPageQueryKey(params: { limit?: number } = {}) {
  return [...notificationsQueryKey, "page", params.limit ?? "default"] as const;
}

export function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationListResponse> {
  return apiGet("/api/notifications", { query: params });
}

export function markNotificationRead(notificationId: string): Promise<AppNotification> {
  return apiPost("/api/notifications/{notificationId}/read", { path: { notificationId } });
}

export function markAllNotificationsRead(): Promise<
  components["schemas"]["MarkAllNotificationsReadResponse"]
> {
  return apiPost("/api/notifications/read-all");
}
