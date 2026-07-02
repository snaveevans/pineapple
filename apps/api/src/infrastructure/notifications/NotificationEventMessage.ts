import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceTaskAdvanced } from "../../domain/maintenance/events/MaintenanceTaskAdvanced.ts";
import type { MaintenanceTaskCreated } from "../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import type { MaintenanceTaskDeleted } from "../../domain/maintenance/events/MaintenanceTaskDeleted.ts";

export const NOTIFICATION_EVENTS_CONSUMER = "notification_events";
export const NOTIFICATION_EVENTS_QUEUE_NAME = "pineapple-notification-events";
export const NOTIFICATION_EVENTS_DLQ_NAME = "pineapple-notification-events-dlq";

type NotificationDomainEvent =
  | MaintenanceTaskCreated
  | MaintenanceTaskAdvanced
  | MaintenanceTaskDeleted;

type NotificationDomainEventType = NotificationDomainEvent["type"];

type NotificationEventCommon<Type extends NotificationDomainEventType> = {
  id: string;
  type: Type;
  occurredAt: string;
  ownerId: string;
  actorId: string;
  maintenanceTaskId: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  taskTitle: string;
};

export type MaintenanceTaskCreatedNotificationMessage =
  NotificationEventCommon<"MaintenanceTaskCreated"> & {
    nextDue: string;
  };

export type MaintenanceTaskAdvancedNotificationMessage =
  NotificationEventCommon<"MaintenanceTaskAdvanced"> & {
    nextDue: string;
    maintenanceRecordId: string;
    performedAt: string;
  };

export type MaintenanceTaskDeletedNotificationMessage =
  NotificationEventCommon<"MaintenanceTaskDeleted">;

export type NotificationEventMessage =
  | MaintenanceTaskCreatedNotificationMessage
  | MaintenanceTaskAdvancedNotificationMessage
  | MaintenanceTaskDeletedNotificationMessage;

type FactoryMap = {
  [Type in NotificationDomainEventType]: (
    event: Extract<NotificationDomainEvent, { type: Type }>,
  ) => Extract<NotificationEventMessage, { type: Type }>;
};

type ValidatorMap = {
  [Type in NotificationDomainEventType]: (value: Record<string, unknown>) => boolean;
};

const FACTORIES = {
  MaintenanceTaskCreated: fromCreated,
  MaintenanceTaskAdvanced: fromAdvanced,
  MaintenanceTaskDeleted: fromDeleted,
} satisfies FactoryMap;

const VALIDATORS = {
  MaintenanceTaskCreated: (value) => isString(value.nextDue),
  MaintenanceTaskAdvanced: (value) =>
    isString(value.nextDue) && isString(value.maintenanceRecordId) && isString(value.performedAt),
  MaintenanceTaskDeleted: () => true,
} satisfies ValidatorMap;

export function toNotificationEventMessage(event: DomainEvent): NotificationEventMessage | null {
  if (!isNotificationDomainEvent(event)) return null;
  const factory = FACTORIES[event.type] as (e: NotificationDomainEvent) => NotificationEventMessage;
  return factory(event);
}

export function isNotificationEventMessage(value: unknown): value is NotificationEventMessage {
  if (!isRecord(value)) return false;
  if (!hasCommonFields(value)) return false;
  if (!isNotificationEventType(value.type)) return false;
  return VALIDATORS[value.type](value);
}

function isNotificationDomainEvent(event: DomainEvent): event is NotificationDomainEvent {
  return isNotificationEventType(event.type);
}

function common<Type extends NotificationDomainEventType>(
  event: Extract<NotificationDomainEvent, { type: Type }>,
): NotificationEventCommon<Type> {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    ownerId: event.ownerId,
    actorId: event.actorId,
    maintenanceTaskId: event.maintenanceTaskId,
    assetId: event.assetId,
    assetName: event.assetName,
    assetType: event.assetType,
    taskTitle: event.title,
  };
}

function fromCreated(event: MaintenanceTaskCreated): MaintenanceTaskCreatedNotificationMessage {
  return { ...common(event), nextDue: event.nextDue };
}

function fromAdvanced(event: MaintenanceTaskAdvanced): MaintenanceTaskAdvancedNotificationMessage {
  return {
    ...common(event),
    nextDue: event.nextDue,
    maintenanceRecordId: event.maintenanceRecordId,
    performedAt: event.performedAt,
  };
}

function fromDeleted(event: MaintenanceTaskDeleted): MaintenanceTaskDeletedNotificationMessage {
  return common(event);
}

function hasCommonFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.id) &&
    isString(value.type) &&
    isString(value.occurredAt) &&
    isString(value.ownerId) &&
    isString(value.actorId) &&
    isString(value.maintenanceTaskId) &&
    isString(value.assetId) &&
    isString(value.assetName) &&
    isAssetType(value.assetType) &&
    isString(value.taskTitle)
  );
}

function isNotificationEventType(value: unknown): value is NotificationDomainEventType {
  return typeof value === "string" && value in FACTORIES;
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
