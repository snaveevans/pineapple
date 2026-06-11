import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../events/DomainEvent.ts";

export type MaintenanceTaskDeleted = DomainEvent & {
  type: "MaintenanceTaskDeleted";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
};

export const MaintenanceTaskDeleted = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
}): MaintenanceTaskDeleted => ({
  type: "MaintenanceTaskDeleted",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  occurredAt: new Date(),
});
