import type {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskAdvanced = DomainEvent & {
  type: "MaintenanceTaskAdvanced";
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  performedAt: string;
};

export const MaintenanceTaskAdvanced = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  performedAt: string;
}): MaintenanceTaskAdvanced => ({
  type: "MaintenanceTaskAdvanced",
  maintenanceTaskId: props.maintenanceTaskId,
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  performedAt: props.performedAt,
  occurredAt: new Date(),
});
