import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskRescheduled = DomainEvent & {
  type: "MaintenanceTaskRescheduled";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  nextDue: string;
  taskRevision: number;
  activityEntryType: "task_rescheduled";
};

export const MaintenanceTaskRescheduled = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  nextDue: string;
  taskRevision: number;
}): MaintenanceTaskRescheduled => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskRescheduled",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  nextDue: props.nextDue,
  taskRevision: props.taskRevision,
  activityEntryType: "task_rescheduled",
});
