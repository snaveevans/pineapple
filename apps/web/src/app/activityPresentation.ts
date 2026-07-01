import type { ActivityEntry, ActivityEntryType } from "../api/activity.ts";
import type { IconName } from "../design/Icon.tsx";
import { assetTypeLabel } from "./assetPresentation.ts";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type ActivityTypeMeta = {
  label: string;
  icon: IconName;
  tone: "neutral" | "good" | "warn" | "bad";
};

export type ActivityPresentation = ActivityEntry & {
  actionLabel: string;
  headline: string;
  detail: string;
  icon: IconName;
  tone: ActivityTypeMeta["tone"];
  timeLabel: string;
};

export type ActivityDayGroup = {
  key: string;
  label: string;
  entries: ActivityPresentation[];
};

export const ACTIVITY_TYPE_META: Record<ActivityEntryType, ActivityTypeMeta> = {
  asset_added: { label: "Assets", icon: "plus", tone: "neutral" },
  maintenance_logged: { label: "Maintenance", icon: "wrench", tone: "neutral" },
  task_completed: { label: "Completed", icon: "check", tone: "good" },
  task_scheduled: { label: "Scheduled", icon: "calendar", tone: "warn" },
  task_deleted: { label: "Removed", icon: "x", tone: "bad" },
};

export function activityTypeLabel(type: ActivityEntryType): string {
  return ACTIVITY_TYPE_META[type].label;
}

export function toActivityPresentation(
  entry: ActivityEntry,
  now: Date = new Date(),
): ActivityPresentation {
  const meta = ACTIVITY_TYPE_META[entry.type];
  return {
    ...entry,
    actionLabel: actionLabel(entry),
    headline: headline(entry),
    detail: detail(entry),
    icon: meta.icon,
    tone: meta.tone,
    timeLabel: timeLabel(entry.occurredAt, now),
  };
}

export function groupActivityEntries(
  entries: ActivityEntry[],
  now: Date = new Date(),
): ActivityDayGroup[] {
  const todayKey = dateKey(now.toISOString());
  const groups = new Map<string, ActivityPresentation[]>();

  for (const entry of entries) {
    const key = dateKey(entry.occurredAt);
    const group = groups.get(key) ?? [];
    group.push(toActivityPresentation(entry, now));
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, groupEntries]) => ({
    key,
    label: dayLabel(key, todayKey),
    entries: groupEntries,
  }));
}

export function actionLabel(entry: ActivityEntry): string {
  switch (entry.type) {
    case "asset_added":
      return "Asset added";
    case "maintenance_logged":
      return "Maintenance logged";
    case "task_completed":
      return "Task completed";
    case "task_scheduled":
      return "Task scheduled";
    case "task_deleted":
      return "Task removed";
  }
}

export function headline(entry: ActivityEntry): string {
  if (entry.type === "asset_added") return entry.asset.name;
  return entry.title ?? "Untitled activity";
}

export function detail(entry: ActivityEntry): string {
  const asset = `${entry.asset.name} · ${assetTypeLabel(entry.asset.type)}`;
  if (entry.performedAt !== undefined)
    return `${asset} · Performed ${formatDate(entry.performedAt)}`;
  return asset;
}

function timeLabel(occurredAt: string, now: Date): string {
  const occurred = new Date(occurredAt);
  const minutes = Math.max(0, Math.round((now.getTime() - occurred.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(dateKey(occurredAt));
}

function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === addDays(todayKey, -1)) return "Yesterday";
  return formatDate(key);
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function formatDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return `${MONTHS_SHORT[month! - 1]} ${day}, ${year}`;
}
