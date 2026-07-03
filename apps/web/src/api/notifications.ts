import type { AssetType } from "./assets.ts";
import { apiRequest } from "./client.ts";

export type NotificationType = "maintenance_due_soon";

export type NotificationAssetSnapshot = {
  id: string;
  name: string;
  type: AssetType;
};

export type NotificationTaskSnapshot = {
  id: string;
  title: string;
  nextDue: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  asset: NotificationAssetSnapshot;
  task: NotificationTaskSnapshot;
};

export type NotificationListResponse = {
  notifications: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

export type ListNotificationsParams = {
  cursor?: string;
  limit?: number;
};

export const notificationsQueryKey = ["notifications"] as const;

export function notificationsPageQueryKey(params: { limit?: number } = {}) {
  return [...notificationsQueryKey, "page", params.limit ?? "default"] as const;
}

export function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiRequest<NotificationListResponse>(`/api/notifications${suffix}`);
}

export function markNotificationRead(notificationId: string): Promise<AppNotification> {
  return apiRequest<AppNotification>(`/api/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(): Promise<{ unreadCount: number }> {
  return apiRequest<{ unreadCount: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}
