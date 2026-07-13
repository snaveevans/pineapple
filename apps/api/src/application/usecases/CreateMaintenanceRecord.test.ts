import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  MaintenanceTaskId,
  NotFoundError,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceRecordWriter } from "../ports/MaintenanceRecordWriter.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { CreateMaintenanceRecord } from "./CreateMaintenanceRecord.ts";

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

class MaintenanceRecordWriterFake implements MaintenanceRecordWriter {
  savedRecord: MaintenanceRecord | null = null;
  savedTask: MaintenanceTask | null = null;
  savedEvents: readonly DomainEvent[] = [];

  save(
    record: MaintenanceRecord,
    advancedTask: MaintenanceTask | null,
    events: readonly DomainEvent[] = [],
  ): Promise<void> {
    this.savedRecord = record;
    this.savedTask = advancedTask;
    this.savedEvents = events;
    return Promise.resolve();
  }
}

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  saved: MaintenanceTask | null = null;
  constructor(private readonly task: MaintenanceTask | null = null) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(this.task);
  }
  save(task: MaintenanceTask): Promise<void> {
    this.saved = task;
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
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

const dates: UtcDateProvider = { today: () => "2026-06-09" };

describe("CreateMaintenanceRecord", () => {
  const ownerId = UserId.generate();

  function assetFor(owner = ownerId): Asset {
    return Asset.create({
      ownerId: owner,
      name: "Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
  }

  it("saves a record and publishes MaintenanceRecordCreated", async () => {
    const asset = assetFor();
    const records = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      records,
      new MaintenanceTaskRepositoryFake(),
      events,
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });

    expect(result.ok).toBe(true);
    expect(records.savedRecord).toBe(result.ok ? result.value : null);
    expect(records.savedTask).toBeNull();
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceRecordCreated",
        assetId: asset.id,
        ownerId,
        actorId: ownerId,
        assetName: "Truck",
        assetType: "vehicle",
        title: "Changed oil",
        taskId: null,
        activityEntryType: "maintenance_logged",
      }),
    ]);
    expect(records.savedRecord?.pullEvents()).toEqual([]);
  });

  it("returns not found when the asset does not exist", async () => {
    const result = await executeWithAsset(null, ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden for another owner's asset", async () => {
    const result = await executeWithAsset(assetFor(UserId.generate()), ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("allows a non-owner team member to log a record on a shared asset", async () => {
    const memberId = UserId.generate();
    const asset = assetFor(ownerId);
    asset.pullEvents();
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    asset.shareToTeam({ teamId: team.id, teamName: team.name, actorId: ownerId });
    asset.pullEvents();
    const memberTeam = Team.reconstitute({
      id: team.id,
      ownerId: team.ownerId,
      name: team.name,
      createdAt: team.createdAt,
      members: [
        ...team.members,
        createMembership({ userId: memberId, role: "member", joinedAt: new Date() }),
      ],
    });
    const records = new MaintenanceRecordWriterFake();
    const events = new EventBusFake();

    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(memberTeam),
      records,
      new MaintenanceTaskRepositoryFake(),
      events,
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: memberId,
      title: "Member logged oil",
      performedAt: "2026-06-09",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ownerId).toBe(ownerId);
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceRecordCreated",
        ownerId,
        actorId: memberId,
        title: "Member logged oil",
      }),
    ]);
  });

  it("returns conflict for an archived asset", async () => {
    const asset = assetFor();
    asset.archivedAt = new Date("2026-06-08T00:00:00.000Z");

    const result = await executeWithAsset(asset, ownerId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
  });

  it("returns validation error for a future performed date", async () => {
    const asset = assetFor();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake(),
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-10",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).field).toBe("performedAt");
    }
  });

  it("normalizes blank notes to null before persistence and response", async () => {
    const asset = assetFor();
    const records = new MaintenanceRecordWriterFake();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      records,
      new MaintenanceTaskRepositoryFake(),
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
      notes: "   ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.notes).toBeNull();
    expect(records.savedRecord?.notes).toBeNull();
  });

  it("returns an invariant error for a malformed UTC date provider value", async () => {
    const asset = assetFor();
    const result = await new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake(),
      new EventBusFake(),
      { today: () => "not-a-date" },
    ).execute({
      assetId: asset.id,
      requesterId: ownerId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe("InvariantError");
      expect("field" in result.error).toBe(false);
    }
  });

  function executeWithAsset(asset: Asset | null, requesterId: UserId) {
    return new CreateMaintenanceRecord(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      new MaintenanceRecordWriterFake(),
      new MaintenanceTaskRepositoryFake(),
      new EventBusFake(),
      dates,
    ).execute({
      assetId: asset?.id ?? AssetId.generate(),
      requesterId,
      title: "Changed oil",
      performedAt: "2026-06-09",
    });
  }

  describe("with taskId", () => {
    function makeTask(
      overrides: {
        assetId?: AssetId;
        ownerId?: UserId;
        lastCompletedDate?: string | null;
      } = {},
    ) {
      const asset = assetFor();
      return MaintenanceTask.reconstitute({
        id: MaintenanceTaskId.generate(),
        assetId: overrides.assetId ?? asset.id,
        ownerId: overrides.ownerId ?? ownerId,
        title: "Replace furnace filter",
        intervalValue: 2,
        intervalUnit: "month",
        lastCompletedDate:
          overrides.lastCompletedDate !== undefined ? overrides.lastCompletedDate : null,
        nextDue: "2026-08-09",
        createdAt: new Date(),
      });
    }

    it("saves the record, advances the task, and publishes MaintenanceTaskAdvanced", async () => {
      const asset = assetFor();
      const task = MaintenanceTask.reconstitute({
        id: MaintenanceTaskId.generate(),
        assetId: asset.id,
        ownerId,
        title: "Replace furnace filter",
        intervalValue: 2,
        intervalUnit: "month",
        lastCompletedDate: "2026-04-09",
        nextDue: "2026-06-09",
        createdAt: new Date(),
      });
      const tasks = new MaintenanceTaskRepositoryFake(task);
      const records = new MaintenanceRecordWriterFake();
      const events = new EventBusFake();

      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        records,
        tasks,
        events,
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: task.id,
      });

      expect(result.ok).toBe(true);
      expect(records.savedTask).toBe(task);
      expect(tasks.saved).toBeNull();
      expect(events.events).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceRecordCreated",
          activityEntryType: null,
          taskId: task.id,
        }),
      );
      expect(records.savedEvents).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceRecordCreated",
          activityEntryType: null,
          taskId: task.id,
        }),
      );
      expect(events.events).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceTaskAdvanced",
          assetName: "Truck",
          assetType: "vehicle",
          title: "Replace furnace filter",
          performedAt: "2026-06-09",
          nextDue: "2026-08-09",
        }),
      );
      expect(records.savedEvents).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceTaskAdvanced",
          assetName: "Truck",
          assetType: "vehicle",
          title: "Replace furnace filter",
          performedAt: "2026-06-09",
          nextDue: "2026-08-09",
        }),
      );
    });

    it("advances a task with no previous completion", async () => {
      const asset = assetFor();
      const task = makeTask({ assetId: asset.id, lastCompletedDate: null });
      const records = new MaintenanceRecordWriterFake();
      const events = new EventBusFake();

      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        records,
        new MaintenanceTaskRepositoryFake(task),
        events,
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Replaced furnace filter",
        performedAt: "2026-06-09",
        taskId: task.id,
      });

      expect(result.ok).toBe(true);
      expect(records.savedTask).toBe(task);
      expect(task.lastCompletedDate).toBe("2026-06-09");
      expect(task.nextDue).toBe("2026-08-09");
      expect(events.events).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceTaskAdvanced",
          assetName: "Truck",
          assetType: "vehicle",
          title: "Replace furnace filter",
          performedAt: "2026-06-09",
          nextDue: "2026-08-09",
        }),
      );
    });

    it("does not advance the task when performedAt equals lastCompletedDate", async () => {
      const asset = assetFor();
      const task = MaintenanceTask.reconstitute({
        id: MaintenanceTaskId.generate(),
        assetId: asset.id,
        ownerId,
        title: "Replace furnace filter",
        intervalValue: 2,
        intervalUnit: "month",
        lastCompletedDate: "2026-06-09",
        nextDue: "2026-08-09",
        createdAt: new Date(),
      });
      const tasks = new MaintenanceTaskRepositoryFake(task);
      const records = new MaintenanceRecordWriterFake();
      const events = new EventBusFake();

      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        records,
        tasks,
        events,
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: task.id,
      });

      expect(result.ok).toBe(true);
      expect(records.savedTask).toBeNull();
      expect(events.events.some((e) => e.type === "MaintenanceTaskAdvanced")).toBe(false);
      expect(events.events).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceRecordCreated",
          activityEntryType: "maintenance_logged",
          taskId: task.id,
        }),
      );
      expect(records.savedEvents).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceRecordCreated",
          activityEntryType: "maintenance_logged",
          taskId: task.id,
        }),
      );
    });

    it("does not advance the task when performedAt is older than lastCompletedDate", async () => {
      const asset = assetFor();
      const task = MaintenanceTask.reconstitute({
        id: MaintenanceTaskId.generate(),
        assetId: asset.id,
        ownerId,
        title: "Replace furnace filter",
        intervalValue: 2,
        intervalUnit: "month",
        lastCompletedDate: "2026-06-09",
        nextDue: "2026-08-09",
        createdAt: new Date(),
      });
      const tasks = new MaintenanceTaskRepositoryFake(task);
      const records = new MaintenanceRecordWriterFake();
      const events = new EventBusFake();

      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        records,
        tasks,
        events,
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-04-01",
        taskId: task.id,
      });

      expect(result.ok).toBe(true);
      expect(records.savedTask).toBeNull();
      expect(events.events.some((e) => e.type === "MaintenanceTaskAdvanced")).toBe(false);
      expect(events.events).toContainEqual(
        expect.objectContaining({
          type: "MaintenanceRecordCreated",
          activityEntryType: "maintenance_logged",
          taskId: task.id,
        }),
      );
    });

    it("returns not found when taskId references a non-existent task", async () => {
      const asset = assetFor();
      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        new MaintenanceRecordWriterFake(),
        new MaintenanceTaskRepositoryFake(null),
        new EventBusFake(),
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: MaintenanceTaskId.generate(),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it("allows a task on an accessible asset even when task.ownerId differs from requester", async () => {
      // Access follows the asset; child ownerId is attribution, not the access gate.
      const asset = assetFor();
      const task = makeTask({ assetId: asset.id, ownerId: UserId.generate() });
      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        new MaintenanceRecordWriterFake(),
        new MaintenanceTaskRepositoryFake(task),
        new EventBusFake(),
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: task.id,
      });

      expect(result.ok).toBe(true);
    });

    it("returns validation error when taskId belongs to a different asset", async () => {
      const asset = assetFor();
      const task = makeTask({ assetId: AssetId.generate(), ownerId });
      const result = await new CreateMaintenanceRecord(
        new AssetRepositoryFake(asset),
        new TeamRepositoryFake(),
        new MaintenanceRecordWriterFake(),
        new MaintenanceTaskRepositoryFake(task),
        new EventBusFake(),
        dates,
      ).execute({
        assetId: asset.id,
        requesterId: ownerId,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: task.id,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect((result.error as ValidationError).field).toBe("taskId");
      }
    });
  });
});
