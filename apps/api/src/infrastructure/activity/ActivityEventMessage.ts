import type { MaintenanceRecordId, MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import {
  ACTIVITY_ENTRY_TYPES,
  type ActivityEntryType,
} from "../../domain/activity/ActivityEntry.ts";
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

type ActivityDomainEvent =
  | AssetCreated
  | MaintenanceRecordCreated
  | MaintenanceTaskCreated
  | MaintenanceTaskAdvanced
  | MaintenanceTaskDeleted;

type ActivityDomainEventType = ActivityDomainEvent["type"];

type ActivityEventCommon<
  Type extends ActivityDomainEventType,
  EntryType extends ActivityEntryType | null,
> = {
  id: string;
  type: Type;
  occurredAt: string;
  assetId: string;
  ownerId: string;
  actorId: string;
  assetName: string;
  assetType: AssetType;
  activityEntryType: EntryType;
};

export type AssetCreatedActivityEventMessage = ActivityEventCommon<"AssetCreated", "asset_added">;

export type MaintenanceRecordCreatedActivityEventMessage = ActivityEventCommon<
  "MaintenanceRecordCreated",
  "maintenance_logged" | null
> & {
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
  taskId: MaintenanceTaskId | null;
};

export type MaintenanceTaskCreatedActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskCreated",
  "task_scheduled"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type MaintenanceTaskAdvancedActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskAdvanced",
  "task_completed"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
};

export type MaintenanceTaskDeletedActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskDeleted",
  "task_deleted"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type ActivityEventMessage =
  | AssetCreatedActivityEventMessage
  | MaintenanceRecordCreatedActivityEventMessage
  | MaintenanceTaskCreatedActivityEventMessage
  | MaintenanceTaskAdvancedActivityEventMessage
  | MaintenanceTaskDeletedActivityEventMessage;

type ActivityMessageFactoryMap = {
  [Type in ActivityDomainEventType]: (
    event: Extract<ActivityDomainEvent, { type: Type }>,
  ) => Extract<ActivityEventMessage, { type: Type }>;
};

type ActivityMessageValidatorMap = {
  [Type in ActivityDomainEventType]: (value: Record<string, unknown>) => boolean;
};

const ACTIVITY_EVENT_MESSAGE_FACTORIES = {
  AssetCreated: fromAssetCreated,
  MaintenanceRecordCreated: fromMaintenanceRecordCreated,
  MaintenanceTaskCreated: fromMaintenanceTaskCreated,
  MaintenanceTaskAdvanced: fromMaintenanceTaskAdvanced,
  MaintenanceTaskDeleted: fromMaintenanceTaskDeleted,
} satisfies ActivityMessageFactoryMap;

const ACTIVITY_EVENT_MESSAGE_VALIDATORS = {
  AssetCreated: (value) => value.activityEntryType === "asset_added",
  MaintenanceRecordCreated: (value) =>
    isString(value.maintenanceRecordId) &&
    isString(value.title) &&
    isString(value.performedAt) &&
    (value.taskId === null || isString(value.taskId)) &&
    (value.activityEntryType === "maintenance_logged" || value.activityEntryType === null),
  MaintenanceTaskCreated: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.title) &&
    value.activityEntryType === "task_scheduled",
  MaintenanceTaskAdvanced: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.maintenanceRecordId) &&
    isString(value.title) &&
    isString(value.performedAt) &&
    value.activityEntryType === "task_completed",
  MaintenanceTaskDeleted: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.title) &&
    value.activityEntryType === "task_deleted",
} satisfies ActivityMessageValidatorMap;

export function toActivityEventMessage(event: DomainEvent): ActivityEventMessage | null {
  if (!isActivityDomainEvent(event)) return null;
  const factory = ACTIVITY_EVENT_MESSAGE_FACTORIES[event.type] as (
    trackedEvent: ActivityDomainEvent,
  ) => ActivityEventMessage;
  return factory(event);
}

export function isActivityEventMessage(value: unknown): value is ActivityEventMessage {
  if (!isRecord(value)) return false;
  if (!hasCommonFields(value)) return false;
  if (!isActivityEventType(value.type)) return false;
  return ACTIVITY_EVENT_MESSAGE_VALIDATORS[value.type](value);
}

function isActivityDomainEvent(event: DomainEvent): event is ActivityDomainEvent {
  return isActivityEventType(event.type);
}

function common<Type extends ActivityDomainEventType, EntryType extends ActivityEntryType | null>(
  event: Extract<ActivityDomainEvent, { type: Type }>,
  activityEntryType: EntryType,
): ActivityEventCommon<Type, EntryType> {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    assetId: event.assetId,
    ownerId: event.ownerId,
    actorId: event.actorId,
    assetName: event.assetName,
    assetType: event.assetType,
    activityEntryType,
  };
}

function fromAssetCreated(event: AssetCreated): AssetCreatedActivityEventMessage {
  return common(event, event.activityEntryType);
}

function fromMaintenanceRecordCreated(
  event: MaintenanceRecordCreated,
): MaintenanceRecordCreatedActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
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
    ...common(event, event.activityEntryType),
    maintenanceTaskId: event.maintenanceTaskId,
    title: event.title,
  };
}

function fromMaintenanceTaskAdvanced(
  event: MaintenanceTaskAdvanced,
): MaintenanceTaskAdvancedActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
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
    ...common(event, event.activityEntryType),
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
    isAssetType(value.assetType) &&
    isActivityEntryTypeOrNull(value.activityEntryType)
  );
}

function isActivityEventType(value: unknown): value is ActivityDomainEventType {
  return typeof value === "string" && value in ACTIVITY_EVENT_MESSAGE_FACTORIES;
}

function isActivityEntryTypeOrNull(value: unknown): value is ActivityEntryType | null {
  return value === null || isActivityEntryType(value);
}

function isActivityEntryType(value: unknown): value is ActivityEntryType {
  return typeof value === "string" && ACTIVITY_ENTRY_TYPES.includes(value as ActivityEntryType);
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
