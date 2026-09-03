import type { z } from "@hono/zod-openapi";
import {
  addCalendarDays,
  calendarDaysBetween,
  MAINTENANCE_DUE_SOON_LEAD_DAYS,
} from "@snaveevans/pineapple-shared";
import type { MaintenanceTask } from "../domain/maintenance/MaintenanceTask.ts";
import { deriveTaskStatus } from "../domain/maintenance/TaskUrgency.ts";
import type { MaintenanceTaskResponseSchema } from "./schemas/maintenanceTaskSchemas.ts";

/**
 * Serializes the public task response shape. Internal fields — `ownerId`,
 * `scheduleSeedDate`, `initialLastCompletedDate`, `nextDueOverride`, and
 * `revision` — are deliberately dropped; this function is the single gate
 * between the domain aggregate and the API contract.
 */
export function serializeMaintenanceTask(
  task: MaintenanceTask,
  todayUtc: string,
): z.infer<typeof MaintenanceTaskResponseSchema> {
  const sevenDaysOut = addCalendarDays(todayUtc, MAINTENANCE_DUE_SOON_LEAD_DAYS);
  return {
    id: task.id,
    assetId: task.assetId,
    title: task.title,
    intervalValue: task.intervalValue,
    intervalUnit: task.intervalUnit,
    lastCompletedDate: task.lastCompletedDate,
    nextDue: task.nextDue,
    status: deriveTaskStatus(task.nextDue, todayUtc, sevenDaysOut),
    daysDue: calendarDaysBetween(todayUtc, task.nextDue),
    createdAt: task.createdAt.toISOString(),
  };
}
