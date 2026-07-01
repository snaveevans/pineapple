import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskAdvanced = DomainEvent & {
  type: "MaintenanceTaskAdvanced";
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  performedAt: string;
  activityEntryType: "task_completed";
};

export const MaintenanceTaskAdvanced = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  performedAt: string;
}): MaintenanceTaskAdvanced => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskAdvanced",
  maintenanceTaskId: props.maintenanceTaskId,
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  performedAt: props.performedAt,
  activityEntryType: "task_completed",
});
