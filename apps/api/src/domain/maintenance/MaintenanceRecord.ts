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
import {
  MaintenanceRecordCreated,
  type MaintenanceRecordActivityEntryType,
} from "./events/MaintenanceRecordCreated.ts";
import { MaintenanceRecordDeleted } from "./events/MaintenanceRecordDeleted.ts";
import { MaintenanceRecordUpdated } from "./events/MaintenanceRecordUpdated.ts";

export class MaintenanceRecord {
  private _domainEvents: DomainEvent[] = [];
  private _title: string;
  private _performedAt: string;
  private _notes: string | null;
  private _revision: number;

  private constructor(
    readonly id: MaintenanceRecordId,
    readonly assetId: AssetId,
    readonly ownerId: UserId,
    title: string,
    performedAt: string,
    notes: string | null,
    readonly taskId: MaintenanceTaskId | null,
    readonly createdAt: Date,
    revision: number = 0,
  ) {
    this._title = title;
    this._performedAt = performedAt;
    this._notes = notes;
    this._revision = revision;
  }

  get title(): string {
    return this._title;
  }

  get performedAt(): string {
    return this._performedAt;
  }

  get notes(): string | null {
    return this._notes;
  }

  get revision(): number {
    return this._revision;
  }

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
    activityEntryType?: MaintenanceRecordActivityEntryType;
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
      0,
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
        activityEntryType:
          props.activityEntryType !== undefined ? props.activityEntryType : "maintenance_logged",
      }),
    );
    return record;
  }

  update(
    props: {
      title?: string;
      performedAt?: string;
      notes?: string | null;
      todayUtc: string;
    },
    actorId: UserId,
    assetSnapshot: { assetName: string; assetType: AssetType },
  ): boolean {
    let nextTitle = this._title;
    if (props.title !== undefined) {
      const trimmed = props.title.trim();
      if (!trimmed) throw new ValidationError("Title is required", "title");
      if (trimmed.length > 100) {
        throw new ValidationError("Title must be 100 characters or fewer", "title");
      }
      nextTitle = trimmed;
    }

    let nextPerformedAt = this._performedAt;
    if (props.performedAt !== undefined) {
      validateDateOnly(props.performedAt, "performedAt");
      try {
        validateDateOnly(props.todayUtc);
      } catch {
        throw new InvariantError("UTC date provider returned an invalid date");
      }
      if (props.performedAt > props.todayUtc) {
        throw new ValidationError("Performed date must be today or earlier", "performedAt");
      }
      nextPerformedAt = props.performedAt;
    }

    let nextNotes = this._notes;
    if (props.notes !== undefined) {
      if (props.notes === null) {
        nextNotes = null;
      } else {
        const trimmedNotes = props.notes.trim();
        if (trimmedNotes.length > 1000) {
          throw new ValidationError("Notes must be 1000 characters or fewer", "notes");
        }
        nextNotes = trimmedNotes || null;
      }
    }

    const changed =
      nextTitle !== this._title ||
      nextPerformedAt !== this._performedAt ||
      nextNotes !== this._notes;

    if (!changed) return false;

    const before = {
      title: this._title,
      performedAt: this._performedAt,
      notes: this._notes,
    };

    this._title = nextTitle;
    this._performedAt = nextPerformedAt;
    this._notes = nextNotes;
    this._revision += 1;

    const after = {
      title: this._title,
      performedAt: this._performedAt,
      notes: this._notes,
    };

    this._domainEvents.push(
      MaintenanceRecordUpdated({
        maintenanceRecordId: this.id,
        assetId: this.assetId,
        ownerId: this.ownerId,
        actorId,
        assetName: assetSnapshot.assetName,
        assetType: assetSnapshot.assetType,
        createdAt: this.createdAt,
        recordRevision: this._revision,
        taskId: this.taskId,
        before,
        after,
      }),
    );
    return true;
  }

  delete(actorId: UserId, assetSnapshot: { assetName: string; assetType: AssetType }): void {
    this._revision += 1;
    this._domainEvents.push(
      MaintenanceRecordDeleted({
        maintenanceRecordId: this.id,
        assetId: this.assetId,
        ownerId: this.ownerId,
        actorId,
        assetName: assetSnapshot.assetName,
        assetType: assetSnapshot.assetType,
        createdAt: this.createdAt,
        recordRevision: this._revision,
        taskId: this.taskId,
        deleted: {
          title: this._title,
          performedAt: this._performedAt,
          notes: this._notes,
        },
      }),
    );
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
    revision?: number;
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
      props.revision ?? 0,
    );
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
