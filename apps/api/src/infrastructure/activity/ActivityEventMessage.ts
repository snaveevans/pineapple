import type { MaintenanceRecordId, MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { AssetCreated } from "../../domain/asset/events/AssetCreated.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceRecordCreated } from "../../domain/maintenance/events/MaintenanceRecordCreated.ts";
import type { MaintenanceTaskAdvanced } from "../../domain/maintenance/events/MaintenanceTaskAdvanced.ts";
import type { MaintenanceTaskCreated } from "../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import type { MaintenanceTaskDeleted } from "../../domain/maintenance/events/MaintenanceTaskDeleted.ts";

export const ACTIVITY_HISTORY_CONSUMER = "activity_history";
export const ACTIVITY_HISTORY_QUEUE_NAME = "pineapple-activity-history";
export const ACTIVITY_HISTORY_DLQ_NAME = "pineapple-activity-history-dlq";

type ActivityEventCommon = {
  id: string;
  type: string;
  occurredAt: string;
  assetId: string;
  ownerId: string;
  actorId: string;
  assetName: string;
  assetType: AssetType;
};

export type AssetCreatedActivityEventMessage = ActivityEventCommon & {
  type: "AssetCreated";
};

export type MaintenanceRecordCreatedActivityEventMessage = ActivityEventCommon & {
  type: "MaintenanceRecordCreated";
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
  taskId: MaintenanceTaskId | null;
};

export type MaintenanceTaskCreatedActivityEventMessage = ActivityEventCommon & {
  type: "MaintenanceTaskCreated";
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type MaintenanceTaskAdvancedActivityEventMessage = ActivityEventCommon & {
  type: "MaintenanceTaskAdvanced";
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
};

export type MaintenanceTaskDeletedActivityEventMessage = ActivityEventCommon & {
  type: "MaintenanceTaskDeleted";
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type ActivityEventMessage =
  | AssetCreatedActivityEventMessage
  | MaintenanceRecordCreatedActivityEventMessage
  | MaintenanceTaskCreatedActivityEventMessage
  | MaintenanceTaskAdvancedActivityEventMessage
  | MaintenanceTaskDeletedActivityEventMessage;

export function toActivityEventMessage(event: DomainEvent): ActivityEventMessage | null {
  switch (event.type) {
    case "AssetCreated":
      return fromAssetCreated(event as AssetCreated);
    case "MaintenanceRecordCreated":
      return fromMaintenanceRecordCreated(event as MaintenanceRecordCreated);
    case "MaintenanceTaskCreated":
      return fromMaintenanceTaskCreated(event as MaintenanceTaskCreated);
    case "MaintenanceTaskAdvanced":
      return fromMaintenanceTaskAdvanced(event as MaintenanceTaskAdvanced);
    case "MaintenanceTaskDeleted":
      return fromMaintenanceTaskDeleted(event as MaintenanceTaskDeleted);
    default:
      return null;
  }
}

export function isActivityEventMessage(value: unknown): value is ActivityEventMessage {
  if (!isRecord(value)) return false;
  if (!hasCommonFields(value)) return false;

  switch (value.type) {
    case "AssetCreated":
      return true;
    case "MaintenanceRecordCreated":
      return (
        isString(value.maintenanceRecordId) &&
        isString(value.title) &&
        isString(value.performedAt) &&
        (value.taskId === null || isString(value.taskId))
      );
    case "MaintenanceTaskCreated":
    case "MaintenanceTaskDeleted":
      return isString(value.maintenanceTaskId) && isString(value.title);
    case "MaintenanceTaskAdvanced":
      return (
        isString(value.maintenanceTaskId) &&
        isString(value.maintenanceRecordId) &&
        isString(value.title) &&
        isString(value.performedAt)
      );
    default:
      return false;
  }
}

function common(
  event:
    | AssetCreated
    | MaintenanceRecordCreated
    | MaintenanceTaskCreated
    | MaintenanceTaskAdvanced
    | MaintenanceTaskDeleted,
): ActivityEventCommon {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    assetId: event.assetId,
    ownerId: event.ownerId,
    actorId: event.actorId,
    assetName: event.assetName,
    assetType: event.assetType,
  };
}

function fromAssetCreated(event: AssetCreated): AssetCreatedActivityEventMessage {
  return {
    ...common(event),
    type: "AssetCreated",
  };
}

function fromMaintenanceRecordCreated(
  event: MaintenanceRecordCreated,
): MaintenanceRecordCreatedActivityEventMessage {
  return {
    ...common(event),
    type: "MaintenanceRecordCreated",
    maintenanceRecordId: event.maintenanceRecordId,
    title: event.title,
    performedAt: event.performedAt,
    taskId: event.taskId,
  };
}

function fromMaintenanceTaskCreated(
  event: MaintenanceTaskCreated,
): MaintenanceTaskCreatedActivityEventMessage {
  return {
    ...common(event),
    type: "MaintenanceTaskCreated",
    maintenanceTaskId: event.maintenanceTaskId,
    title: event.title,
  };
}

function fromMaintenanceTaskAdvanced(
  event: MaintenanceTaskAdvanced,
): MaintenanceTaskAdvancedActivityEventMessage {
  return {
    ...common(event),
    type: "MaintenanceTaskAdvanced",
    maintenanceTaskId: event.maintenanceTaskId,
    maintenanceRecordId: event.maintenanceRecordId,
    title: event.title,
    performedAt: event.performedAt,
  };
}

function fromMaintenanceTaskDeleted(
  event: MaintenanceTaskDeleted,
): MaintenanceTaskDeletedActivityEventMessage {
  return {
    ...common(event),
    type: "MaintenanceTaskDeleted",
    maintenanceTaskId: event.maintenanceTaskId,
    title: event.title,
  };
}

function hasCommonFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.id) &&
    isString(value.type) &&
    isString(value.occurredAt) &&
    isString(value.assetId) &&
    isString(value.ownerId) &&
    isString(value.actorId) &&
    isString(value.assetName) &&
    isAssetType(value.assetType)
  );
}

function isAssetType(value: unknown): value is AssetType {
  return value === "vehicle" || value === "property" || value === "equipment";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
