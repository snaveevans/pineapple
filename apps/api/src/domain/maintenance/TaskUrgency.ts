import { addCalendarDays } from "./DateOnly.ts";

export type TaskUrgencyStatus = "overdue" | "soon" | "ok";

const URGENCY_RANK: Record<TaskUrgencyStatus, number> = {
  overdue: 0,
  soon: 1,
  ok: 2,
};

export function deriveTaskStatus(
  nextDue: string,
  todayUtc: string,
  sevenDaysOut = addCalendarDays(todayUtc, 7),
): TaskUrgencyStatus {
  if (nextDue < todayUtc) return "overdue";
  if (nextDue <= sevenDaysOut) return "soon";
  return "ok";
}

export function compareTaskUrgency(left: TaskUrgencyStatus, right: TaskUrgencyStatus): number {
  return URGENCY_RANK[left] - URGENCY_RANK[right];
}

export function mostUrgentTaskStatus(
  statuses: readonly TaskUrgencyStatus[],
): TaskUrgencyStatus | null {
  if (statuses.length === 0) return null;
  return statuses.reduce((best, status) => (compareTaskUrgency(status, best) < 0 ? status : best));
}
