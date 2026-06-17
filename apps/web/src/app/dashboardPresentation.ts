import { calendarDaysBetween } from "@snaveevans/pineapple-shared";
import type { AssetType, DashboardQueueItem } from "../api/dashboard.ts";
import type { IconName } from "../design/Icon.tsx";
import type { AssetCategory, AssetStatus } from "../design/hf.tsx";
import { shortenAssetId } from "./assetPresentation.ts";

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DashboardCategoryFilter = "all" | AssetType;

export type DashboardQueuePresentation = {
  taskId: string;
  assetId: string;
  name: string;
  displayId: string;
  category: AssetCategory;
  icon: IconName;
  service: string;
  due: string;
  status: AssetStatus;
  last: string;
  recurs: string;
};

function ymdParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year!, month!, day!];
}

export function formatDashboardDate(todayUtc: string): string {
  const [year, month, day] = ymdParts(todayUtc);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
  return `${weekday} · ${MONTHS_LONG[month - 1]} ${day}, ${year}`;
}

export function formatFleetSubline(todayUtc: string, total: number): string {
  const noun = total === 1 ? "asset" : "assets";
  return `${formatDashboardDate(todayUtc)} · ${total} ${noun} in your fleet`;
}

export function formatDueLabel(nextDue: string, todayUtc: string): string {
  const daysAhead = calendarDaysBetween(todayUtc, nextDue);
  if (daysAhead < 0) {
    const overdueDays = -daysAhead;
    return overdueDays === 1 ? "Overdue · 1 day" : `Overdue · ${overdueDays} days`;
  }
  if (daysAhead === 0) return "Today";
  if (daysAhead === 1) return "Tomorrow";
  return `In ${daysAhead} days`;
}

export function formatLastService(lastCompletedDate: string | null): string {
  if (!lastCompletedDate) return "—";
  const [, month, day] = ymdParts(lastCompletedDate);
  return `${MONTHS_LONG[month - 1]!.slice(0, 3)} ${day}`;
}

export function formatRecurrence(intervalValue: number, intervalUnit: string): string {
  if (intervalValue === 1) {
    switch (intervalUnit) {
      case "day":
        return "Daily";
      case "week":
        return "Weekly";
      case "month":
        return "Monthly";
      case "year":
        return "Annual";
      default:
        return `Every ${intervalUnit}`;
    }
  }
  return `Every ${intervalValue} ${intervalUnit}s`;
}

function iconForAssetType(type: AssetType): IconName {
  switch (type) {
    case "vehicle":
      return "truck";
    case "property":
      return "home";
    case "equipment":
      return "wrench";
  }
}

export function toQueuePresentation(
  item: DashboardQueueItem,
  todayUtc: string,
): DashboardQueuePresentation {
  return {
    taskId: item.taskId,
    assetId: item.assetId,
    name: item.assetName,
    displayId: shortenAssetId(item.assetId),
    category: item.assetType,
    icon: iconForAssetType(item.assetType),
    service: item.taskTitle,
    due: formatDueLabel(item.nextDue, todayUtc),
    status: item.status,
    last: formatLastService(item.lastCompletedDate),
    recurs: formatRecurrence(item.intervalValue, item.intervalUnit),
  };
}

export function filterQueueByCategory(
  items: DashboardQueuePresentation[],
  category: DashboardCategoryFilter,
): DashboardQueuePresentation[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}
