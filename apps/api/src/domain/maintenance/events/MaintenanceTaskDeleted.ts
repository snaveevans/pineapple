import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskDeleted = DomainEvent & {
  type: "MaintenanceTaskDeleted";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  activityEntryType: "task_deleted";
};

export const MaintenanceTaskDeleted = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
}): MaintenanceTaskDeleted => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskDeleted",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  activityEntryType: "task_deleted",
});
