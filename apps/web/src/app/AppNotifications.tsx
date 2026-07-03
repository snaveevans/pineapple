import { useEffect, useMemo, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryKey,
  notificationsPageQueryKey,
  type AppNotification,
} from "../api/notifications.ts";
import { ApiError } from "../api/client.ts";
import { Icon, type IconName } from "../design/Icon.tsx";
import { HFAssetIcon } from "../design/hf.tsx";
import { paths } from "../routes.ts";
import { HFBottomNav, HFTopBar } from "./AppChrome.tsx";
import { dateKey, formatShortDate, ymdToUTC } from "./dateFormat.ts";

import "../design/styles/hifi.css";
import "./styles/notifications.css";

const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

function notificationAssetIcon(asset: AppNotification["asset"]): {
  category: AppNotification["asset"]["type"];
  icon: IconName;
} {
  const name = asset.name.toLowerCase();
  if (asset.type === "vehicle") {
    return {
      category: asset.type,
      icon: name.includes("van") || name.includes("sprinter") ? "van" : "truck",
    };
  }
  if (asset.type === "property") {
    return {
      category: asset.type,
      icon: name.includes("lawn") || name.includes("yard") ? "leaf" : "home",
    };
  }
  if (name.includes("mower")) return { category: asset.type, icon: "mower" };
  if (name.includes("generator") || name.includes("generac")) {
    return { category: asset.type, icon: "bolt" };
  }
  return { category: asset.type, icon: "wrench" };
}

function relativeLabel(iso: string, now: Date): string {
  const created = new Date(iso);
  const msDiff = Math.max(0, now.getTime() - created.getTime());
  const minutes = Math.floor(msDiff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function dueLabel(nextDue: string, now: Date): string {
  const days = Math.round((ymdToUTC(nextDue) - ymdToUTC(dateKey(now.toISOString()))) / DAY_MS);
  if (days < 0) return `overdue by ${Math.abs(days)}d`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

function NotificationRow({
  notification,
  now,
  onRead,
}: {
  notification: AppNotification;
  now: Date;
  onRead: (notificationId: string) => void;
}) {
  const isUnread = notification.readAt === null;
  const assetIcon = notificationAssetIcon(notification.asset);

  return (
    <button
      type="button"
      className={`nt-row${isUnread ? " is-unread" : ""}`}
      onClick={() => onRead(notification.id)}
      aria-label={`${notification.task.title} ${dueLabel(notification.task.nextDue, now)} for ${notification.asset.name}`}
    >
      <span className="nt-dot" aria-hidden="true" />
      <HFAssetIcon asset={assetIcon} size={38} />
      <span className="nt-text">
        <span className="nt-line1">
          <b>{notification.task.title}</b> {dueLabel(notification.task.nextDue, now)} -{" "}
          {notification.asset.name}
        </span>
        <span className="nt-line2">
          Maintenance reminder · {formatShortDate(notification.task.nextDue)}
        </span>
      </span>
      <span className="nt-time">{relativeLabel(notification.createdAt, now)}</span>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="nt-loading" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((i) => (
        <div className="nt-skel-row" key={i}>
          <div className="nt-skel-icon nt-skel-pulse" />
          <div className="nt-skel-lines">
            <div className="nt-skel-line nt-skel-pulse" style={{ width: "70%" }} />
            <div className="nt-skel-line nt-skel-pulse" style={{ width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="nt-empty">
      <div className="nt-empty-icon">
        <Icon name={icon} size={22} stroke={1.6} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function AppNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useInfiniteQuery({
    queryKey: notificationsPageQueryKey({ limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listNotifications({
        limit: PAGE_SIZE,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  useEffect(() => {
    document.title = "FieldOps - Notifications";
  }, []);

  useEffect(() => {
    if (notificationsQuery.error instanceof ApiError && notificationsQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [notificationsQuery.error, navigate]);

  const notifications = useMemo(
    () => notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [],
    [notificationsQuery.data],
  );
  const firstPage = notificationsQuery.data?.pages[0];
  const unreadCount = firstPage?.unreadCount ?? 0;
  const isUnauthorized =
    notificationsQuery.error instanceof ApiError && notificationsQuery.error.status === 401;
  const now = useMemo(() => new Date(), [notificationsQuery.dataUpdatedAt]);
  const mutationError = markReadMutation.error ?? markAllReadMutation.error;

  const markRead = (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);
    if (notification?.readAt !== null) return;
    markReadMutation.mutate(notificationId);
  };

  let body: ReactNode;
  if (notificationsQuery.isPending) {
    body = <SkeletonRows />;
  } else if (isUnauthorized) {
    body = (
      <NotificationState
        icon="lock"
        title="Redirecting to sign in"
        description="Your session is no longer active."
      />
    );
  } else if (notificationsQuery.isError) {
    body = (
      <NotificationState
        icon="alert"
        title="Notifications could not be loaded"
        description="Something went wrong on our end. Check your connection and try again."
        action={
          <button
            type="button"
            className="hf-btn hf-btn-primary"
            onClick={() => void notificationsQuery.refetch()}
          >
            <Icon name="repeat" size={14} stroke={2} />
            Try again
          </button>
        }
      />
    );
  } else if (notifications.length === 0) {
    body = (
      <NotificationState
        icon="bell-off"
        title="You're all caught up"
        description="Maintenance reminders will show up here as tasks come due on your assets."
      />
    );
  } else {
    body = (
      <>
        {mutationError !== null && (
          <div className="nt-error" role="alert">
            {mutationError instanceof Error
              ? mutationError.message
              : "Notification could not be updated."}
          </div>
        )}
        {notifications.map((notification, index) => (
          <div key={notification.id}>
            <NotificationRow notification={notification} now={now} onRead={markRead} />
            {index < notifications.length - 1 && <div className="nt-divider" />}
          </div>
        ))}
        <div className="nt-loadmore">
          {notificationsQuery.hasNextPage ? (
            <button
              type="button"
              className="hf-btn"
              disabled={notificationsQuery.isFetchingNextPage}
              onClick={() => void notificationsQuery.fetchNextPage()}
            >
              <Icon name="chevron-down" size={14} stroke={2} />
              {notificationsQuery.isFetchingNextPage
                ? "Loading older notifications"
                : "Load older notifications"}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="hf hf-app nt">
      <HFTopBar />
      <main className="nt-main">
        <div className="nt-crumb">
          <div className="nt-head">
            <h1>Notifications</h1>
            {!notificationsQuery.isPending && unreadCount > 0 && (
              <span className="nt-unread-count">{unreadCount} unread</span>
            )}
          </div>
          <button
            type="button"
            className="hf-btn"
            onClick={() => markAllReadMutation.mutate()}
            disabled={
              notificationsQuery.isPending || unreadCount === 0 || markAllReadMutation.isPending
            }
          >
            <Icon name="check" size={13} stroke={2.2} />
            {markAllReadMutation.isPending ? "Saving..." : "Mark all as read"}
          </button>
        </div>
        <div className="nt-body">
          <div className="nt-col">{body}</div>
        </div>
      </main>
      <HFBottomNav />
    </div>
  );
}
