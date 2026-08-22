import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";
import type { MaintenanceRecordSnapshot } from "./MaintenanceRecordUpdated.ts";

export type MaintenanceRecordDeleted = DomainEvent & {
  type: "MaintenanceRecordDeleted";
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  createdAt: Date;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  deleted: MaintenanceRecordSnapshot;
  activityEntryType: "maintenance_record_deleted";
};

export const MaintenanceRecordDeleted = (props: {
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  createdAt: Date;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  deleted: MaintenanceRecordSnapshot;
}): MaintenanceRecordDeleted => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceRecordDeleted",
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  createdAt: props.createdAt,
  recordRevision: props.recordRevision,
  taskId: props.taskId,
  deleted: props.deleted,
  activityEntryType: "maintenance_record_deleted",
});
