import type {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

/**
 * One per accepted snooze: a reminder cycle's next fire was postponed to
 * `snoozedUntil` without any change to the task's schedule. The task keeps its
 * `nextDue`, recurrence, and urgency; only the reminder moved.
 */
export type MaintenanceReminderSnoozed = DomainEvent & {
  type: "MaintenanceReminderSnoozed";
  maintenanceTaskId: MaintenanceTaskId;
  scheduledReminderId: ScheduledReminderId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  snoozedUntil: string;
};

export const MaintenanceReminderSnoozed = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  scheduledReminderId: ScheduledReminderId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  snoozedUntil: string;
}): MaintenanceReminderSnoozed => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceReminderSnoozed",
  maintenanceTaskId: props.maintenanceTaskId,
  scheduledReminderId: props.scheduledReminderId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  snoozedUntil: props.snoozedUntil,
});
