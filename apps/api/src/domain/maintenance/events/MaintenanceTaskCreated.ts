import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";
import type { IntervalUnit } from "../IntervalUnit.ts";

export type MaintenanceTaskCreated = DomainEvent & {
  type: "MaintenanceTaskCreated";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

export const MaintenanceTaskCreated = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
}): MaintenanceTaskCreated => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskCreated",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  intervalValue: props.intervalValue,
  intervalUnit: props.intervalUnit,
});
