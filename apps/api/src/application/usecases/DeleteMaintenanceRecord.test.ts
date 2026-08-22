import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  MaintenanceRecordId,
  MaintenanceTaskId,
  NotFoundError,
  ServiceUnavailableError,
  UserId,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceRecordWriter } from "../ports/MaintenanceRecordWriter.ts";
import type { MaintenanceWriteGate } from "../ports/MaintenanceWriteGate.ts";
import { DeleteMaintenanceRecord } from "./DeleteMaintenanceRecord.ts";

class AssetRepositoryFake implements AssetRepository {
  constructor(private readonly asset: Asset | null) {}
  findById(): Promise<Asset | null> {
    return Promise.resolve(this.asset);
  }
  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class TeamRepositoryFake implements TeamRepository {
  constructor(private readonly team: Team | null = null) {}
  findByMember(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }
  findById(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class MaintenanceRecordRepositoryFake implements MaintenanceRecordRepository {
  constructor(private readonly records: MaintenanceRecord[]) {}
  findByAsset(): Promise<MaintenanceRecord[]> {
    return Promise.resolve(this.records.map((r) => this.cloneRecord(r)));
  }
  findById(id: string): Promise<MaintenanceRecord | null> {
    const found = this.records.find((r) => r.id === id);
    return Promise.resolve(found ? this.cloneRecord(found) : null);
  }
  findByTask(taskId: string): Promise<MaintenanceRecord[]> {
    return Promise.resolve(
      this.records.filter((r) => r.taskId === taskId).map((r) => this.cloneRecord(r)),
    );
  }
  save(): Promise<void> {
    return Promise.resolve();
  }

  private cloneRecord(r: MaintenanceRecord): MaintenanceRecord {
    return MaintenanceRecord.reconstitute({
      id: r.id,
      assetId: r.assetId,
      ownerId: r.ownerId,
      title: r.title,
      performedAt: r.performedAt,
      notes: r.notes,
      taskId: r.taskId,
      createdAt: r.createdAt,
      revision: r.revision,
    });
  }
}

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  constructor(private readonly tasks: MaintenanceTask[] = []) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks.map((t) => this.cloneTask(t)));
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks.map((t) => this.cloneTask(t)));
  }
  findById(id: string): Promise<MaintenanceTask | null> {
    const found = this.tasks.find((t) => t.id === id);
    return Promise.resolve(found ? this.cloneTask(found) : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }

  private cloneTask(t: MaintenanceTask): MaintenanceTask {
    return MaintenanceTask.reconstitute({
      id: t.id,
      assetId: t.assetId,
      ownerId: t.ownerId,
      title: t.title,
      intervalValue: t.intervalValue,
      intervalUnit: t.intervalUnit,
      scheduleSeedDate: t.scheduleSeedDate,
      initialLastCompletedDate: t.initialLastCompletedDate,
      lastCompletedDate: t.lastCompletedDate,
      nextDue: t.nextDue,
      createdAt: t.createdAt,
      revision: t.revision,
    });
  }
}

class MaintenanceRecordWriterFake implements MaintenanceRecordWriter {
  deletedRecord: MaintenanceRecord | null = null;
  reconciledTask: MaintenanceTask | null = null;
  events: readonly DomainEvent[] = [];
  failDeleteWithCas = false;

  save(): Promise<void> {
    return Promise.resolve();
  }
  update(): Promise<boolean> {
    return Promise.resolve(true);
  }
  delete(
    record: MaintenanceRecord,
    _expectedRecordRevision: number,
    reconciledTask: MaintenanceTask | null,
    _expectedTaskRevision?: number,
    events: readonly DomainEvent[] = [],
  ): Promise<boolean> {
    if (this.failDeleteWithCas) {
      return Promise.resolve(false);
    }
    this.deletedRecord = record;
    this.reconciledTask = reconciledTask;
    this.events = events;
    return Promise.resolve(true);
  }
}

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];
  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  subscribe(): void {}
}

class MaintenanceWriteGateFake implements MaintenanceWriteGate {
  constructor(private readonly mode: "open" | "frozen" = "open") {}
  isWritable(): Promise<boolean> {
    return Promise.resolve(this.mode === "open");
  }
}

describe("DeleteMaintenanceRecord", () => {
  const ownerId = UserId.generate();

  function assetFor(owner = ownerId): Asset {
    return Asset.create({
      ownerId: owner,
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  }

  function makeRecord(
    asset: Asset,
    overrides: {
      id?: MaintenanceRecordId;
      title?: string;
      performedAt?: string;
      notes?: string | null;
      taskId?: MaintenanceTaskId | null;
      revision?: number;
    } = {},
  ): MaintenanceRecord {
    return MaintenanceRecord.reconstitute({
      id: overrides.id ?? MaintenanceRecordId.generate(),
      assetId: asset.id,
      ownerId: asset.ownerId,
      title: overrides.title ?? "Oil Change",
      performedAt: overrides.performedAt ?? "2026-05-01",
      notes: overrides.notes !== undefined ? overrides.notes : "Standard filter",
      taskId: overrides.taskId !== undefined ? overrides.taskId : null,
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      revision: overrides.revision ?? 1,
    });
  }

  function makeTask(
    asset: Asset,
    overrides: {
      id?: MaintenanceTaskId;
      title?: string;
      intervalValue?: number;
      intervalUnit?: "day" | "week" | "month" | "year";
      scheduleSeedDate?: string;
      initialLastCompletedDate?: string | null;
      lastCompletedDate?: string | null;
      nextDue?: string;
      revision?: number;
    } = {},
  ): MaintenanceTask {
    return MaintenanceTask.reconstitute({
      id: overrides.id ?? MaintenanceTaskId.generate(),
      assetId: asset.id,
      ownerId: asset.ownerId,
      title: overrides.title ?? "Routine Service",
      intervalValue: overrides.intervalValue ?? 3,
      intervalUnit: overrides.intervalUnit ?? "month",
      scheduleSeedDate: overrides.scheduleSeedDate ?? "2026-01-01",
      initialLastCompletedDate: overrides.initialLastCompletedDate ?? null,
      lastCompletedDate:
        overrides.lastCompletedDate !== undefined ? overrides.lastCompletedDate : "2026-05-01",
      nextDue: overrides.nextDue ?? "2026-08-01",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      revision: overrides.revision ?? 1,
    });
  }

  it("deletes an unlinked record and publishes MaintenanceRecordDeleted", async () => {
    const asset = assetFor();
    const record = makeRecord(asset);
    const writer = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      writer,
      new MaintenanceTaskRepositoryFake([]),
      events,
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: record.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(writer.deletedRecord?.id).toBe(record.id);
    expect(writer.deletedRecord?.revision).toBe(2);
    expect(writer.reconciledTask).toBeNull();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceRecordDeleted",
      assetId: asset.id,
      ownerId,
      actorId: ownerId,
      maintenanceRecordId: record.id,
      deleted: {
        title: record.title,
        performedAt: record.performedAt,
        notes: record.notes,
      },
    });
  });

  it("deletes the latest linked record and rewinds the task to the surviving previous record", async () => {
    const asset = assetFor();
    const task = makeTask(asset, {
      scheduleSeedDate: "2026-01-01",
      lastCompletedDate: "2026-05-01",
      nextDue: "2026-08-01",
      intervalValue: 3,
      intervalUnit: "month",
    });
    const olderRecord = makeRecord(asset, { taskId: task.id, performedAt: "2026-02-01" });
    const latestRecord = makeRecord(asset, { taskId: task.id, performedAt: "2026-05-01" });
    const writer = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([olderRecord, latestRecord]),
      writer,
      new MaintenanceTaskRepositoryFake([task]),
      events,
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: latestRecord.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(writer.reconciledTask).not.toBeNull();
    expect(writer.reconciledTask?.lastCompletedDate).toBe("2026-02-01");
    expect(writer.reconciledTask?.nextDue).toBe("2026-05-01");
    expect(writer.reconciledTask?.revision).toBe(2);

    expect(events.events).toHaveLength(2);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceRecordDeleted",
      maintenanceRecordId: latestRecord.id,
    });
    expect(events.events[1]).toMatchObject({
      type: "MaintenanceTaskReconciled",
      maintenanceTaskId: task.id,
      lastCompletedDate: "2026-02-01",
      nextDue: "2026-05-01",
    });
  });

  it("deletes the only linked record on a task without initial completion and resets to seed date schedule", async () => {
    const asset = assetFor();
    const task = makeTask(asset, {
      scheduleSeedDate: "2026-01-01",
      initialLastCompletedDate: null,
      lastCompletedDate: "2026-03-01",
      nextDue: "2026-06-01",
      intervalValue: 3,
      intervalUnit: "month",
    });
    const onlyRecord = makeRecord(asset, { taskId: task.id, performedAt: "2026-03-01" });
    const writer = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([onlyRecord]),
      writer,
      new MaintenanceTaskRepositoryFake([task]),
      events,
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: onlyRecord.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(writer.reconciledTask).not.toBeNull();
    expect(writer.reconciledTask?.lastCompletedDate).toBeNull();
    expect(writer.reconciledTask?.nextDue).toBe("2026-04-01"); // 2026-01-01 + 3 months

    expect(events.events).toHaveLength(2);
    expect(events.events[1]).toMatchObject({
      type: "MaintenanceTaskReconciled",
      maintenanceTaskId: task.id,
      lastCompletedDate: null,
      nextDue: "2026-04-01",
    });
  });

  it("deletes a non-latest linked record without changing task schedule", async () => {
    const asset = assetFor();
    const task = makeTask(asset, {
      scheduleSeedDate: "2026-01-01",
      lastCompletedDate: "2026-05-01",
      nextDue: "2026-08-01",
      intervalValue: 3,
      intervalUnit: "month",
    });
    const olderRecord = makeRecord(asset, { taskId: task.id, performedAt: "2026-02-01" });
    const latestRecord = makeRecord(asset, { taskId: task.id, performedAt: "2026-05-01" });
    const writer = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    // Deleting the older record
    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([olderRecord, latestRecord]),
      writer,
      new MaintenanceTaskRepositoryFake([task]),
      events,
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: olderRecord.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(true);
    expect(writer.reconciledTask).toBeNull();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceRecordDeleted",
      maintenanceRecordId: olderRecord.id,
    });
  });

  it("returns 503 when write gate is frozen", async () => {
    const asset = assetFor();
    const record = makeRecord(asset);
    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake([]),
      new EventBusFake(),
      new MaintenanceWriteGateFake("frozen"),
    ).execute({
      assetId: asset.id,
      recordId: record.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ServiceUnavailableError);
      expect((result.error as ServiceUnavailableError).code).toBe("maintenance_write_frozen");
    }
  });

  it("returns 409 Conflict when asset is archived", async () => {
    const asset = assetFor();
    asset.archivedAt = new Date("2026-06-01T00:00:00.000Z");
    const record = makeRecord(asset);

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake([]),
      new EventBusFake(),
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: record.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConflictError);
    }
  });

  it("returns 404 when record does not belong to asset in route", async () => {
    const asset = assetFor();
    const record = makeRecord(asset);
    const otherAssetId = AssetId.generate();

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake([]),
      new EventBusFake(),
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: otherAssetId,
      recordId: record.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
  });

  it("returns 403 when requester does not have access to asset", async () => {
    const asset = assetFor();
    const record = makeRecord(asset);

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake([]),
      new EventBusFake(),
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: record.id,
      requesterId: UserId.generate(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it("returns 409 Conflict when CAS retries are exhausted", async () => {
    const asset = assetFor();
    const record = makeRecord(asset);
    const writer = new MaintenanceRecordWriterFake();
    writer.failDeleteWithCas = true;

    const result = await new DeleteMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordRepositoryFake([record]),
      writer,
      new MaintenanceTaskRepositoryFake([]),
      new EventBusFake(),
      new MaintenanceWriteGateFake("open"),
    ).execute({
      assetId: asset.id,
      recordId: record.id,
      requesterId: ownerId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConflictError);
    }
  });
});
