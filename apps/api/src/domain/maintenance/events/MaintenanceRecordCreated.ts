import type { AssetId, MaintenanceRecordId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceRecordCreated = DomainEvent & {
  type: "MaintenanceRecordCreated";
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  performedAt: string;
};

export const MaintenanceRecordCreated = (props: {
  maintenanceRecordId: MaintenanceRecordId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  performedAt: string;
}): MaintenanceRecordCreated => ({
  type: "MaintenanceRecordCreated",
  maintenanceRecordId: props.maintenanceRecordId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  performedAt: props.performedAt,
  occurredAt: new Date(),
});
