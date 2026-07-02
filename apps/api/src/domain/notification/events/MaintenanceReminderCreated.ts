import type {
  AssetId,
  MaintenanceTaskId,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceReminderCreated = DomainEvent & {
  type: "MaintenanceReminderCreated";
  notificationId: NotificationId;
  notificationType: "maintenance_due_soon";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: "system";
  leadDays: number;
};

export const MaintenanceReminderCreated = (props: {
  notificationId: NotificationId;
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  leadDays: number;
}): MaintenanceReminderCreated => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceReminderCreated",
  notificationId: props.notificationId,
  notificationType: "maintenance_due_soon",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: "system",
  leadDays: props.leadDays,
});
