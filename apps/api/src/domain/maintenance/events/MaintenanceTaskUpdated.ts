import type { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../asset/AssetType.ts";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";
import type { IntervalUnit } from "../IntervalUnit.ts";

export type MaintenanceTaskUpdated = DomainEvent & {
  type: "MaintenanceTaskUpdated";
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  nextDue: string;
  activityEntryType: "task_updated";
};

export const MaintenanceTaskUpdated = (props: {
  maintenanceTaskId: MaintenanceTaskId;
  assetId: AssetId;
  ownerId: UserId;
  actorId: UserId;
  assetName: string;
  assetType: AssetType;
  title: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  nextDue: string;
}): MaintenanceTaskUpdated => ({
  ...createDomainEventMetadata(),
  type: "MaintenanceTaskUpdated",
  maintenanceTaskId: props.maintenanceTaskId,
  assetId: props.assetId,
  ownerId: props.ownerId,
  actorId: props.actorId,
  assetName: props.assetName,
  assetType: props.assetType,
  title: props.title,
  intervalValue: props.intervalValue,
  intervalUnit: props.intervalUnit,
  nextDue: props.nextDue,
  activityEntryType: "task_updated",
});
