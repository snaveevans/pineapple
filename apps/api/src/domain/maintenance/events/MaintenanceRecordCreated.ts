import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceRecordCreated = DomainEvent & {
  type: "MaintenanceRecordCreated";
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  performedAt: string;
  taskId: MaintenanceTaskId | null;
};

export const MaintenanceRecordCreated = (props: {
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  performedAt: string;
  taskId: MaintenanceTaskId | null;
}): MaintenanceRecordCreated => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceRecordCreated",
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  performedAt: props.performedAt,
  taskId: props.taskId,
});
