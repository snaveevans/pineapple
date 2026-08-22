import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskReconciled = DomainEvent & {
  type: "MaintenanceTaskReconciled";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  lastCompletedDate: string | null;
  nextDue: string;
  sourceRecordId: MaintenanceRecordId;
  taskRevision: number;
  activityEntryType: null;
};

export const MaintenanceTaskReconciled = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  lastCompletedDate: string | null;
  nextDue: string;
  sourceRecordId: MaintenanceRecordId;
  taskRevision: number;
}): MaintenanceTaskReconciled => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskReconciled",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  lastCompletedDate: props.lastCompletedDate,
  nextDue: props.nextDue,
  sourceRecordId: props.sourceRecordId,
  taskRevision: props.taskRevision,
  activityEntryType: null,
});
