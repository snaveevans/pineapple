import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceRecordSnapshot = {
  title: string;
  performedAt: string;
  notes: string | null;
};

export type MaintenanceRecordUpdated = DomainEvent & {
  type: "MaintenanceRecordUpdated";
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  createdAt: Date;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  before: MaintenanceRecordSnapshot;
  after: MaintenanceRecordSnapshot;
  activityEntryType: "maintenance_record_updated";
};

export const MaintenanceRecordUpdated = (props: {
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  createdAt: Date;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  before: MaintenanceRecordSnapshot;
  after: MaintenanceRecordSnapshot;
}): MaintenanceRecordUpdated => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceRecordUpdated",
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  createdAt: props.createdAt,
  recordRevision: props.recordRevision,
  taskId: props.taskId,
  before: props.before,
  after: props.after,
  activityEntryType: "maintenance_record_updated",
});
