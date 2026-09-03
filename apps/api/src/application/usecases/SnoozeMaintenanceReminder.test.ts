import {
  addCalendarDays,
  AssetId,
  ConflictError,
  ForbiddenError,
  InvariantError,
  MaintenanceTaskId,
  NotFoundError,
  ScheduledReminderId,
  TeamId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { createMembership } from "../../domain/team/Membership.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { ScheduledReminderStatus } from "../notifications/notificationTypes.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  ScheduledReminderRecord,
  ScheduledReminderRepository,
} from "../ports/ScheduledReminderRepository.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { SnoozeMaintenanceReminder } from "./SnoozeMaintenanceReminder.ts";

const taskId = MaintenanceTaskId.generate();
const assetId = AssetId.generate();
const ownerId = UserId.generate();
const teamId = TeamId.generate();
const teamMemberId = UserId.generate();

const dates: UtcDateProvider = { today: () => "2026-09-03" };
const clock: Clock = { now: () => new Date("2026-09-03T23:59:00.000Z") };

class TaskRepoFake implements MaintenanceTaskRepository {
  findByIdCalls = 0;
  constructor(private readonly task: MaintenanceTask | null) {}
  findByAsset(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findForVisibleActiveAssets(): Promise<MaintenanceTask[]> {
    return Promise.resolve([]);
  }
  findById(id: MaintenanceTaskId): Promise<MaintenanceTask | null> {
    this.findByIdCalls += 1;
    return Promise.resolve(id === taskId ? this.task : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

class AssetRepoFake implements AssetRepository {
  constructor(private readonly asset: Asset | null) {}
  findById(id: AssetId): Promise<Asset | null> {
    return Promise.resolve(id === assetId ? this.asset : null);
  }
  findVisibleTo(): Promise<Asset[]> {
    return Promise.resolve([]);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class TeamRepoFake implements TeamRepository {
  constructor(private readonly team: Team | null) {}
  findByMember(memberId: UserId): Promise<Team | null> {
    return Promise.resolve(memberId === teamMemberId ? this.team : null);
  }
  findById(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class ReminderRepoFake implements ScheduledReminderRepository {
  readonly snoozeCalls: {
    id: ScheduledReminderId;
    expectedStatus: ScheduledReminderStatus;
    snoozedUntil: string;
  }[] = [];
  snoozeResponses: boolean[] = [];
  snoozeErrors: Error[] = [];
  constructor(
    private readonly rowsByAttempt: (ScheduledReminderRecord | null)[],
    private readonly unexpectedStatus: string | null = null,
  ) {}
  save(): Promise<void> {
    return Promise.resolve();
  }
  findPendingByTask(): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(null);
  }
  findCurrentByTask(): Promise<ScheduledReminderRecord | null> {
    const row = this.rowsByAttempt.shift() ?? null;
    if (row && this.unexpectedStatus !== null) {
      return Promise.resolve({ ...row, status: this.unexpectedStatus as ScheduledReminderStatus });
    }
    return Promise.resolve(row);
  }
  findByTaskAndCycle(): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(null);
  }
  findCurrentByTasks(): Promise<ScheduledReminderRecord[]> {
    return Promise.resolve([]);
  }
  findDue(): Promise<ScheduledReminderRecord[]> {
    return Promise.resolve([]);
  }
  updateStatus(): Promise<void> {
    return Promise.resolve();
  }
  updateSnapshot(): Promise<void> {
    return Promise.resolve();
  }
  snooze(
    id: ScheduledReminderId,
    expectedStatus: ScheduledReminderStatus,
    snoozedUntil: string,
  ): Promise<boolean> {
    this.snoozeCalls.push({ id, expectedStatus, snoozedUntil });
    const failure = this.snoozeErrors.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(this.snoozeResponses.shift() ?? true);
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

function makeTask(overrides: Partial<Parameters<typeof MaintenanceTask.reconstitute>[0]> = {}) {
  return MaintenanceTask.reconstitute({
    id: taskId,
    assetId,
    ownerId,
    title: "Replace furnace filter",
    intervalValue: 3,
    intervalUnit: "month",
    lastCompletedDate: "2026-06-01",
    nextDue: "2026-09-01",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

function makeAsset(overrides: Partial<Parameters<typeof Asset.reconstitute>[0]> = {}) {
  return Asset.reconstitute({
    id: assetId,
    ownerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

function makeTeam(): Team {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return Team.reconstitute({
    id: teamId,
    ownerId,
    name: "Crew",
    createdAt: now,
    members: [
      createMembership({ userId: ownerId, role: "owner", joinedAt: now }),
      createMembership({ userId: teamMemberId, role: "member", joinedAt: now }),
    ],
  });
}

function reminder(overrides: Partial<ScheduledReminderRecord> = {}): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.generate(),
    ownerId,
    actorId: "system",
    maintenanceTaskId: taskId,
    assetId,
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Replace furnace filter",
    nextDue: "2026-09-01",
    fireAt: "2026-08-25",
    status: "pending",
    snoozedUntil: null,
    lastEventId: "evt-1",
    lastEventOccurredAt: new Date("2026-08-01T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function build(parts: {
  task?: MaintenanceTask | null;
  asset?: Asset | null;
  team?: Team | null;
  viewerId?: UserId;
  rowsByAttempt?: (ScheduledReminderRecord | null)[];
  unexpectedStatus?: string | null;
  snoozeResponses?: boolean[];
  snoozeErrors?: Error[];
}) {
  const tasks = new TaskRepoFake(parts.task === undefined ? makeTask() : parts.task);
  const assets = new AssetRepoFake(parts.asset === undefined ? makeAsset() : parts.asset);
  const teams = new TeamRepoFake(parts.team ?? null);
  const reminders = new ReminderRepoFake(
    parts.rowsByAttempt ?? [reminder()],
    parts.unexpectedStatus ?? null,
  );
  reminders.snoozeResponses = parts.snoozeResponses ?? [];
  reminders.snoozeErrors = parts.snoozeErrors ?? [];
  const events = new EventBusFake();
  const useCase = new SnoozeMaintenanceReminder(
    tasks,
    assets,
    teams,
    reminders,
    dates,
    clock,
    events,
  );
  return {
    useCase,
    tasks,
    assets,
    teams,
    reminders,
    events,
    command: {
      taskId,
      assetId,
      requesterId: parts.viewerId ?? ownerId,
    },
  };
}

describe("SnoozeMaintenanceReminder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("snoozes a pending reminder until todayUtc + 1, computed server-side", async () => {
    const { useCase, command, reminders } = build({});
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({ taskId, snoozedUntil: "2026-09-04" });
    expect(reminders.snoozeCalls).toEqual([
      {
        id: reminders.snoozeCalls[0]?.id,
        expectedStatus: "pending",
        snoozedUntil: "2026-09-04",
      },
    ]);
  });

  it("publishes exactly one snooze event and no MaintenanceTask* event", async () => {
    const { useCase, command, events } = build({});
    await useCase.execute(command);

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceReminderSnoozed",
      maintenanceTaskId: taskId,
      assetId,
      ownerId,
      actorId: ownerId,
      snoozedUntil: "2026-09-04",
    });
  });

  it("reads the task only for authorization and never writes maintenance-task storage", async () => {
    const { useCase, command, tasks } = build({});
    await useCase.execute(command);

    expect(tasks.findByIdCalls).toBe(1);
  });

  it("re-arms an already-fired cycle back to pending", async () => {
    const fired = reminder({ status: "fired" });
    const { useCase, command, reminders, events } = build({ rowsByAttempt: [fired] });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
    expect(reminders.snoozeCalls[0]?.expectedStatus).toBe("fired");
    if (!result.ok) throw result.error;
    expect(events.events[0]).toMatchObject({ type: "MaintenanceReminderSnoozed" });
  });

  it("records the snoozing user as the actor, distinct from the task owner", async () => {
    const { useCase, command, events } = build({
      viewerId: teamMemberId,
      team: makeTeam(),
      asset: makeAsset({ sharedTeamId: teamId }),
    });
    await useCase.execute(command);

    expect(events.events[0]).toMatchObject({ ownerId, actorId: teamMemberId });
  });

  it("returns 404 when the task has no reminder state, logging an anomaly", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useCase, command } = build({ rowsByAttempt: [null] });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("returns 404 for a deleted task's terminal (canceled) cycle without an anomaly", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useCase, command } = build({
      rowsByAttempt: [reminder({ status: "canceled" })],
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for an unresolvable current cycle (superseded), logging an anomaly", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useCase, command } = build({
      rowsByAttempt: [reminder({ status: "superseded" })],
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("fails closed as an invariant violation when the cycle status is unknown", async () => {
    const { useCase, command } = build({
      rowsByAttempt: [reminder()],
      unexpectedStatus: "scheduled",
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(InvariantError);
  });

  it("returns 403 when the requester cannot access the asset", async () => {
    const { useCase, command } = build({ viewerId: UserId.generate() });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("allows a team-shared member to snooze", async () => {
    const { useCase, command } = build({
      viewerId: teamMemberId,
      team: makeTeam(),
      asset: makeAsset({ sharedTeamId: teamId }),
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
  });

  it("returns 404 for an unknown task and for a task that belongs to another asset", async () => {
    const missing = build({ task: null });
    expect((await missing.useCase.execute(missing.command)).ok).toBe(false);

    const otherAsset = build({ task: makeTask({ assetId: AssetId.generate() }) });
    const result = await otherAsset.useCase.execute(otherAsset.command);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("retries against fresh state when the conditional write loses a race", async () => {
    const stale = reminder({ status: "pending" });
    const fresh = reminder({ status: "pending" });
    const { useCase, command, reminders } = build({
      rowsByAttempt: [stale, fresh],
      snoozeResponses: [false, true],
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
    expect(reminders.snoozeCalls).toHaveLength(2);
    expect(reminders.snoozeCalls[1]?.id).toBe(fresh.id);
  });

  it("treats a unique-index collision as a lost race and retries", async () => {
    const fired = reminder({ status: "fired" });
    const fresh = reminder({ status: "pending" });
    const { useCase, command, reminders } = build({
      rowsByAttempt: [fired, fresh],
      snoozeErrors: [new Error("UNIQUE constraint failed: scheduled_reminders.idx_pending")],
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
    expect(reminders.snoozeCalls).toHaveLength(2);
  });

  it("returns 409 after the bounded retries are exhausted", async () => {
    const { useCase, command, reminders } = build({
      rowsByAttempt: [reminder(), reminder(), reminder(), reminder()],
      snoozeResponses: [false, false, false, false],
    });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(ConflictError);
    expect(reminders.snoozeCalls).toHaveLength(4);
  });

  it("re-snoozes by replacing the snooze date (one snooze per cycle)", async () => {
    const snoozed = reminder({ snoozedUntil: "2026-09-04" });
    const { useCase, command, reminders } = build({ rowsByAttempt: [snoozed] });
    const result = await useCase.execute(command);

    expect(result.ok).toBe(true);
    expect(reminders.snoozeCalls).toHaveLength(1);
    expect(reminders.snoozeCalls[0]?.snoozedUntil).toBe("2026-09-04");
  });

  it("snoozing near UTC midnight yields the UTC calendar day, not a local offset", async () => {
    // The provider returns a date-only value; the +1 must be calendar
    // arithmetic on that UTC day (addCalendarDays), regardless of wall clock.
    const { useCase, command } = build({});
    const result = await useCase.execute(command);

    if (!result.ok) throw result.error;
    expect(result.value.snoozedUntil).toBe(addCalendarDays("2026-09-03", 1));
  });
});
