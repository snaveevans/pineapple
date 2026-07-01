import {
  type AssetId,
  InvariantError,
  type MaintenanceRecordId,
  MaintenanceTaskId,
  type UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../asset/AssetType.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { validateDateOnly } from "./DateOnly.ts";
import { type IntervalUnit, INTERVAL_UNITS, addInterval } from "./IntervalUnit.ts";
import { MaintenanceTaskAdvanced } from "./events/MaintenanceTaskAdvanced.ts";
import { MaintenanceTaskCreated } from "./events/MaintenanceTaskCreated.ts";
import { MaintenanceTaskDeleted } from "./events/MaintenanceTaskDeleted.ts";

export class MaintenanceTask {
  private _domainEvents: DomainEvent[] = [];
  private _lastCompletedDate: string | null;
  private _nextDue: string;

  private constructor(
    readonly id: MaintenanceTaskId,
    readonly assetId: AssetId,
    readonly ownerId: UserId,
    readonly title: string,
    readonly intervalValue: number,
    readonly intervalUnit: IntervalUnit,
    lastCompletedDate: string | null,
    nextDue: string,
    readonly createdAt: Date,
  ) {
    this._lastCompletedDate = lastCompletedDate;
    this._nextDue = nextDue;
  }

  get lastCompletedDate(): string | null {
    return this._lastCompletedDate;
  }

  get nextDue(): string {
    return this._nextDue;
  }

  willAdvance(performedAt: string): boolean {
    return this._lastCompletedDate === null || performedAt > this._lastCompletedDate;
  }

  static create(props: {
    assetId: AssetId;
    ownerId: UserId;
    actorId: UserId;
    assetName: string;
    assetType: AssetType;
    title: string;
    intervalValue: number;
    intervalUnit: IntervalUnit;
    lastCompletedDate?: string;
    todayUtc: string;
  }): MaintenanceTask {
    const title = props.title.trim();
    if (!title) throw new ValidationError("Title is required", "title");
    if (title.length > 100) {
      throw new ValidationError("Title must be 100 characters or fewer", "title");
    }

    if (!Number.isInteger(props.intervalValue) || props.intervalValue < 1) {
      throw new ValidationError("Interval value must be a positive integer", "intervalValue");
    }

    if (!INTERVAL_UNITS.includes(props.intervalUnit)) {
      throw new ValidationError("Interval unit must be day, week, month, or year", "intervalUnit");
    }

    try {
      validateDateOnly(props.todayUtc);
    } catch {
      throw new InvariantError("UTC date provider returned an invalid date");
    }

    let lastCompletedDate: string | null = null;
    if (props.lastCompletedDate !== undefined) {
      validateDateOnly(props.lastCompletedDate, "lastCompletedDate");
      if (props.lastCompletedDate > props.todayUtc) {
        throw new ValidationError(
          "Last completed date must be today or earlier",
          "lastCompletedDate",
        );
      }
      lastCompletedDate = props.lastCompletedDate;
    }

    const baseline = lastCompletedDate ?? props.todayUtc;
    const nextDue = addInterval(baseline, props.intervalValue, props.intervalUnit);

    const task = new MaintenanceTask(
      MaintenanceTaskId.generate(),
      props.assetId,
      props.ownerId,
      title,
      props.intervalValue,
      props.intervalUnit,
      lastCompletedDate,
      nextDue,
      new Date(),
    );
    task._domainEvents.push(
      MaintenanceTaskCreated({
        maintenanceTaskId: task.id,
        assetId: task.assetId,
        ownerId: task.ownerId,
        actorId: props.actorId,
        assetName: props.assetName,
        assetType: props.assetType,
        title: task.title,
        intervalValue: task.intervalValue,
        intervalUnit: task.intervalUnit,
      }),
    );
    return task;
  }

  /** Advances lastCompletedDate and nextDue when performedAt is strictly newer. Returns true if advanced. */
  advance(
    performedAt: string,
    recordId: MaintenanceRecordId,
    actorId: UserId,
    assetSnapshot: { assetName: string; assetType: AssetType },
  ): boolean {
    if (!this.willAdvance(performedAt)) {
      return false;
    }
    this._lastCompletedDate = performedAt;
    this._nextDue = addInterval(performedAt, this.intervalValue, this.intervalUnit);
    this._domainEvents.push(
      MaintenanceTaskAdvanced({
        maintenanceTaskId: this.id,
        maintenanceRecordId: recordId,
        assetId: this.assetId,
        ownerId: this.ownerId,
        actorId,
        assetName: assetSnapshot.assetName,
        assetType: assetSnapshot.assetType,
        title: this.title,
        performedAt,
      }),
    );
    return true;
  }

  remove(actorId: UserId, assetSnapshot: { assetName: string; assetType: AssetType }): void {
    this._domainEvents.push(
      MaintenanceTaskDeleted({
        maintenanceTaskId: this.id,
        assetId: this.assetId,
        ownerId: this.ownerId,
        actorId,
        assetName: assetSnapshot.assetName,
        assetType: assetSnapshot.assetType,
        title: this.title,
      }),
    );
  }

  static reconstitute(props: {
    id: MaintenanceTaskId;
    assetId: AssetId;
    ownerId: UserId;
    title: string;
    intervalValue: number;
    intervalUnit: IntervalUnit;
    lastCompletedDate: string | null;
    nextDue: string;
    createdAt: Date;
  }): MaintenanceTask {
    return new MaintenanceTask(
      props.id,
      props.assetId,
      props.ownerId,
      props.title,
      props.intervalValue,
      props.intervalUnit,
      props.lastCompletedDate,
      props.nextDue,
      props.createdAt,
    );
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
