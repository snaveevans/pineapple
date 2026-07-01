import {
  type AssetId,
  InvariantError,
  MaintenanceRecordId,
  type MaintenanceTaskId,
  type UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../asset/AssetType.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { validateDateOnly } from "./DateOnly.ts";
import { MaintenanceRecordCreated } from "./events/MaintenanceRecordCreated.ts";

export class MaintenanceRecord {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: MaintenanceRecordId,
    readonly assetId: AssetId,
    readonly ownerId: UserId,
    readonly title: string,
    readonly performedAt: string,
    readonly notes: string | null,
    readonly taskId: MaintenanceTaskId | null,
    readonly createdAt: Date,
  ) {}

  static create(props: {
    assetId: AssetId;
    ownerId: UserId;
    actorId: UserId;
    assetName: string;
    assetType: AssetType;
    title: string;
    performedAt: string;
    notes?: string;
    taskId?: MaintenanceTaskId;
    todayUtc: string;
  }): MaintenanceRecord {
    const title = props.title.trim();
    if (!title) throw new ValidationError("Title is required", "title");
    if (title.length > 100) {
      throw new ValidationError("Title must be 100 characters or fewer", "title");
    }

    const notes = props.notes?.trim() || null;
    if (notes !== null && notes.length > 1000) {
      throw new ValidationError("Notes must be 1000 characters or fewer", "notes");
    }

    validateDateOnly(props.performedAt);
    try {
      validateDateOnly(props.todayUtc);
    } catch {
      throw new InvariantError("UTC date provider returned an invalid date");
    }
    if (props.performedAt > props.todayUtc) {
      throw new ValidationError("Performed date must be today or earlier", "performedAt");
    }

    const record = new MaintenanceRecord(
      MaintenanceRecordId.generate(),
      props.assetId,
      props.ownerId,
      title,
      props.performedAt,
      notes,
      props.taskId ?? null,
      new Date(),
    );
    record._domainEvents.push(
      MaintenanceRecordCreated({
        maintenanceRecordId: record.id,
        assetId: record.assetId,
        ownerId: record.ownerId,
        actorId: props.actorId,
        assetName: props.assetName,
        assetType: props.assetType,
        title: record.title,
        performedAt: record.performedAt,
        taskId: record.taskId,
      }),
    );
    return record;
  }

  static reconstitute(props: {
    id: MaintenanceRecordId;
    assetId: AssetId;
    ownerId: UserId;
    title: string;
    performedAt: string;
    notes: string | null;
    taskId: MaintenanceTaskId | null;
    createdAt: Date;
  }): MaintenanceRecord {
    return new MaintenanceRecord(
      props.id,
      props.assetId,
      props.ownerId,
      props.title,
      props.performedAt,
      props.notes,
      props.taskId,
      props.createdAt,
    );
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
