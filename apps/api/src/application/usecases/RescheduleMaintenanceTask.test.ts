import { describe, expect, it } from "vitest";
import {
  AssetId,
  ConflictError,
  ForbiddenError,
  MaintenanceTaskId,
  NotFoundError,
  ServiceUnavailableError,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { MaintenanceTaskWriter } from "../ports/MaintenanceTaskWriter.ts";
import type { MaintenanceWriteGate } from "../ports/MaintenanceWriteGate.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { RescheduleMaintenanceTask } from "./RescheduleMaintenanceTask.ts";

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

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  saved: MaintenanceTask | null = null;
  savedEvents: readonly DomainEvent[] = [];
  constructor(private tasks: MaintenanceTask[]) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks.map((t) => this.cloneTask(t)));
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve(this.tasks.map((t) => this.cloneTask(t)));
  }
  findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null> {
    const found = this.tasks.find((t) => t.id === id);
    return Promise.resolve(found ? this.cloneTask(found) : null);
  }
  save(task: MaintenanceTask, events: readonly DomainEvent[] = []): Promise<void> {
    this.saved = task;
    this.savedEvents = events;
    this.tasks = this.tasks.map((t) => (t.id === task.id ? task : t));
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
      nextDueOverride: t.nextDueOverride,
    });
  }
}

class MaintenanceTaskWriterFake implements MaintenanceTaskWriter {
  committed = false;
  conflictsRemaining = 0;
  constructor(private readonly repo: MaintenanceTaskRepositoryFake) {}
  async updateWithRevision(
    task: MaintenanceTask,
    _expectedTaskRevision: number,
    events: readonly DomainEvent[] = [],
  ): Promise<boolean> {
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      return false;
    }
    this.committed = true;
    await this.repo.save(task, events);
    return true;
  }
}

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

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];
  publish(e: DomainEvent): Promise<void> {
    this.events.push(e);
    return Promise.resolve();
  }
  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  subscribe(): void {}
}

class WriteGateFake implements MaintenanceWriteGate {
  constructor(private readonly writable: boolean) {}
  isWritable(): Promise<boolean> {
    return Promise.resolve(this.writable);
  }
}

const dates: UtcDateProvider = { today: () => "2026-06-11" };

describe("RescheduleMaintenanceTask", () => {
  const ownerId = UserId.generate();
  const assetId = AssetId.generate();
  const asset = Asset.reconstitute({
    id: assetId,
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    archivedAt: null,
    createdAt: new Date("2026-06-11T12:00:00.000Z"),
    updatedAt: new Date("2026-06-11T12:00:00.000Z"),
  });

  function makeTask(overrides: Partial<Parameters<typeof MaintenanceTask.reconstitute>[0]> = {}) {
    return MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId,
      ownerId,
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-05-11",
      nextDue: "2026-07-11",
      createdAt: new Date(),
      ...overrides,
    });
  }

  function build(tasks: MaintenanceTask[]) {
    const repo = new MaintenanceTaskRepositoryFake(tasks);
    const writer = new MaintenanceTaskWriterFake(repo);
    const events = new EventBusFake();
    const useCase = new RescheduleMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      writer,
      events,
      dates,
    );
    return { repo, writer, events, useCase };
  }

  it("reschedules to a future date and publishes MaintenanceTaskRescheduled", async () => {
    const task = makeTask();
    const { repo, events, useCase } = build([task]);

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextDue).toBe("2026-09-15");
      expect(result.value.nextDueOverride).toBe("2026-09-15");
    }
    expect(repo.saved?.nextDue).toBe("2026-09-15");
    expect(repo.saved?.lastCompletedDate).toBe("2026-05-11");
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "MaintenanceTaskRescheduled",
        nextDue: "2026-09-15",
        taskRevision: 1,
        activityEntryType: "task_rescheduled",
      }),
    ]);
  });

  it("is a no-op when the target equals the current nextDue: 200, no write, no event", async () => {
    const task = makeTask();
    const { repo, writer, events, useCase } = build([task]);

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-07-11",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nextDue).toBe("2026-07-11");
    expect(writer.committed).toBe(false);
    expect(repo.saved).toBeNull();
    expect(events.events).toHaveLength(0);
  });

  it("returns ValidationError for a past target", async () => {
    const task = makeTask();
    const { useCase } = build([task]);

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-06-10",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      if (result.error instanceof ValidationError) expect(result.error.field).toBe("nextDue");
    }
  });

  it("returns ValidationError for a target equal to today", async () => {
    const task = makeTask();
    const { useCase } = build([task]);

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-06-11",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ValidationError);
  });

  it("returns ValidationError for a malformed target", async () => {
    const task = makeTask();
    const { useCase } = build([task]);

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-13-45",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ValidationError);
  });

  it("returns not found when the task does not exist", async () => {
    const { useCase } = build([]);
    const result = await useCase.execute({
      taskId: MaintenanceTaskId.generate(),
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns not found when the task belongs to a different asset", async () => {
    const task = makeTask();
    const { useCase } = build([task]);
    const result = await useCase.execute({
      taskId: task.id,
      assetId: AssetId.generate(),
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden when the requester cannot access the parent asset", async () => {
    const task = makeTask();
    const { useCase } = build([task]);
    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: UserId.generate(),
      nextDue: "2026-09-15",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("permits rescheduling a task on an archived asset", async () => {
    const archivedAsset = Asset.reconstitute({
      id: assetId,
      ownerId,
      name: asset.name,
      metadata: asset.metadata,
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake([task]);
    const writer = new MaintenanceTaskWriterFake(repo);
    const events = new EventBusFake();

    const result = await new RescheduleMaintenanceTask(
      new AssetRepositoryFake(archivedAsset),
      new TeamRepositoryFake(),
      repo,
      writer,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(true);
  });

  it("retries once after a CAS conflict and succeeds against fresh state", async () => {
    const task = makeTask();
    const { repo, writer, events, useCase } = build([task]);
    writer.conflictsRemaining = 1;

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    expect(writer.committed).toBe(true);
    expect(events.events).toHaveLength(1);
    expect(repo.saved?.nextDue).toBe("2026-09-15");
  });

  it("returns ConflictError after exhausting CAS attempts", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake([task]);
    const events = new EventBusFake();
    const failingWriter: MaintenanceTaskWriter = {
      updateWithRevision: () => Promise.resolve(false),
    };

    const result = await new RescheduleMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      failingWriter,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
    expect(events.events).toHaveLength(0);
  });

  it("returns ServiceUnavailableError when the write gate is frozen", async () => {
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake([task]);
    const writer = new MaintenanceTaskWriterFake(repo);
    const useCase = new RescheduleMaintenanceTask(
      new AssetRepositoryFake(asset),
      new TeamRepositoryFake(),
      repo,
      writer,
      new EventBusFake(),
      dates,
      new WriteGateFake(false),
    );

    const result = await useCase.execute({
      taskId: task.id,
      assetId,
      requesterId: ownerId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ServiceUnavailableError);
      if (result.error instanceof ServiceUnavailableError) {
        expect(result.error.code).toBe("maintenance_write_frozen");
      }
    }
    expect(writer.committed).toBe(false);
  });

  it("allows a non-owner team member to reschedule a task on a shared asset", async () => {
    const memberId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });
    team.pullEvents();
    const sharedAsset = Asset.reconstitute({
      id: assetId,
      ownerId,
      name: asset.name,
      metadata: asset.metadata,
      archivedAt: null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      sharedTeamId: team.id,
    });
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
    const task = makeTask();
    const repo = new MaintenanceTaskRepositoryFake([task]);
    const writer = new MaintenanceTaskWriterFake(repo);
    const events = new EventBusFake();

    const result = await new RescheduleMaintenanceTask(
      new AssetRepositoryFake(sharedAsset),
      new TeamRepositoryFake(memberTeam),
      repo,
      writer,
      events,
      dates,
    ).execute({
      taskId: task.id,
      assetId,
      requesterId: memberId,
      nextDue: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    expect(events.events).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskRescheduled", actorId: memberId }),
    ]);
  });
});
