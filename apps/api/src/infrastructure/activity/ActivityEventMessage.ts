import type { MaintenanceRecordId, MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import {
  ACTIVITY_ENTRY_TYPES,
  type ActivityEntryType,
} from "../../domain/activity/ActivityEntry.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { AssetCreated } from "../../domain/asset/events/AssetCreated.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceRecordCreated } from "../../domain/maintenance/events/MaintenanceRecordCreated.ts";
import type { MaintenanceRecordDeleted } from "../../domain/maintenance/events/MaintenanceRecordDeleted.ts";
import type { MaintenanceRecordUpdated } from "../../domain/maintenance/events/MaintenanceRecordUpdated.ts";
import type { MaintenanceTaskAdvanced } from "../../domain/maintenance/events/MaintenanceTaskAdvanced.ts";
import type { MaintenanceTaskCreated } from "../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import type { MaintenanceTaskDeleted } from "../../domain/maintenance/events/MaintenanceTaskDeleted.ts";
import type { MaintenanceTaskRescheduled } from "../../domain/maintenance/events/MaintenanceTaskRescheduled.ts";
import type { MaintenanceTaskUpdated } from "../../domain/maintenance/events/MaintenanceTaskUpdated.ts";

export const ACTIVITY_HISTORY_CONSUMER = "activity_history";
export const ACTIVITY_HISTORY_QUEUE_NAME = "pineapple-activity-history";
export const ACTIVITY_HISTORY_DLQ_NAME = "pineapple-activity-history-dlq";

type ActivityDomainEvent =
  | AssetCreated
  | MaintenanceRecordCreated
  | MaintenanceRecordUpdated
  | MaintenanceRecordDeleted
  | MaintenanceTaskCreated
  | MaintenanceTaskUpdated
  | MaintenanceTaskRescheduled
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
  /**
   * Display-name snapshot for the acting user (ADR-0010). Optional on the wire so
   * in-flight queue payloads from before this field remain valid; the outbox insert
   * enriches it from `users` before enqueue, and the projection falls back to
   * "Unknown" when absent.
   */
  actorDisplayName?: string;
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

export type MaintenanceRecordUpdatedActivityEventMessage = ActivityEventCommon<
  "MaintenanceRecordUpdated",
  "maintenance_record_updated"
> & {
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
  createdAt: string;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  before: { title: string; performedAt: string; notes: string | null };
  after: { title: string; performedAt: string; notes: string | null };
};

export type MaintenanceRecordDeletedActivityEventMessage = ActivityEventCommon<
  "MaintenanceRecordDeleted",
  "maintenance_record_deleted"
> & {
  maintenanceRecordId: MaintenanceRecordId;
  title: string;
  performedAt: string;
  createdAt: string;
  recordRevision: number;
  taskId: MaintenanceTaskId | null;
  deleted: { title: string; performedAt: string; notes: string | null };
};

export type MaintenanceTaskCreatedActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskCreated",
  "task_scheduled"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type MaintenanceTaskUpdatedActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskUpdated",
  "task_updated"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
};

export type MaintenanceTaskRescheduledActivityEventMessage = ActivityEventCommon<
  "MaintenanceTaskRescheduled",
  "task_rescheduled"
> & {
  maintenanceTaskId: MaintenanceTaskId;
  title: string;
  nextDue: string;
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
  | MaintenanceRecordUpdatedActivityEventMessage
  | MaintenanceRecordDeletedActivityEventMessage
  | MaintenanceTaskCreatedActivityEventMessage
  | MaintenanceTaskUpdatedActivityEventMessage
  | MaintenanceTaskRescheduledActivityEventMessage
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
  MaintenanceRecordUpdated: fromMaintenanceRecordUpdated,
  MaintenanceRecordDeleted: fromMaintenanceRecordDeleted,
  MaintenanceTaskCreated: fromMaintenanceTaskCreated,
  MaintenanceTaskUpdated: fromMaintenanceTaskUpdated,
  MaintenanceTaskRescheduled: fromMaintenanceTaskRescheduled,
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
  MaintenanceRecordUpdated: (value) =>
    isString(value.maintenanceRecordId) &&
    isString(value.title) &&
    isString(value.performedAt) &&
    (value.taskId === null || isString(value.taskId)) &&
    value.activityEntryType === "maintenance_record_updated" &&
    isRecord(value.before) &&
    isRecord(value.after),
  MaintenanceRecordDeleted: (value) =>
    isString(value.maintenanceRecordId) &&
    isString(value.title) &&
    isString(value.performedAt) &&
    (value.taskId === null || isString(value.taskId)) &&
    value.activityEntryType === "maintenance_record_deleted" &&
    isRecord(value.deleted),
  MaintenanceTaskCreated: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.title) &&
    value.activityEntryType === "task_scheduled",
  MaintenanceTaskUpdated: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.title) &&
    value.activityEntryType === "task_updated",
  MaintenanceTaskRescheduled: (value) =>
    isString(value.maintenanceTaskId) &&
    isString(value.title) &&
    isString(value.nextDue) &&
    value.activityEntryType === "task_rescheduled",
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

function fromMaintenanceRecordUpdated(
  event: MaintenanceRecordUpdated,
): MaintenanceRecordUpdatedActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
    maintenanceRecordId: event.maintenanceRecordId,
    title: event.after.title,
    performedAt: event.after.performedAt,
    createdAt: event.createdAt.toISOString(),
    recordRevision: event.recordRevision,
    taskId: event.taskId,
    before: event.before,
    after: event.after,
  };
}

function fromMaintenanceRecordDeleted(
  event: MaintenanceRecordDeleted,
): MaintenanceRecordDeletedActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
    maintenanceRecordId: event.maintenanceRecordId,
    title: event.deleted.title,
    performedAt: event.deleted.performedAt,
    createdAt: event.createdAt.toISOString(),
    recordRevision: event.recordRevision,
    taskId: event.taskId,
    deleted: event.deleted,
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

function fromMaintenanceTaskUpdated(
  event: MaintenanceTaskUpdated,
): MaintenanceTaskUpdatedActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
    maintenanceTaskId: event.maintenanceTaskId,
    title: event.title,
  };
}

function fromMaintenanceTaskRescheduled(
  event: MaintenanceTaskRescheduled,
): MaintenanceTaskRescheduledActivityEventMessage {
  return {
    ...common(event, event.activityEntryType),
    maintenanceTaskId: event.maintenanceTaskId,
    title: event.title,
    nextDue: event.nextDue,
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
    (value.actorDisplayName === undefined || isString(value.actorDisplayName)) &&
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
