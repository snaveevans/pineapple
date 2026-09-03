import {
  AssetId,
  InvariantError,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type {
  ScheduledReminderRecord,
  ScheduledReminderRepository,
} from "../ports/ScheduledReminderRepository.ts";
import type { ScheduledReminderStatus } from "../notifications/notificationTypes.ts";
import type { NotificationEventLog } from "../ports/NotificationEventLog.ts";
import type { Clock } from "../ports/Clock.ts";
import {
  IngestMaintenanceReminderEvent,
  type IngestMaintenanceReminderEventCommand,
} from "./IngestMaintenanceReminderEvent.ts";

const taskId = MaintenanceTaskId.generate();

class ReminderRepoFake implements ScheduledReminderRepository {
  readonly saved: ScheduledReminderRecord[] = [];
  readonly statusUpdates: {
    id: ScheduledReminderId;
    status: ScheduledReminderStatus;
    updatedAt: Date;
  }[] = [];
  readonly snapshots: {
    id: ScheduledReminderId;
    taskTitle: string;
    lastEventId: string;
    updatedAt: Date;
  }[] = [];
  constructor(
    private current: ScheduledReminderRecord | null = null,
    private readonly byCycle: ScheduledReminderRecord | null = null,
    private readonly failSave = false,
  ) {}
  save(r: ScheduledReminderRecord): Promise<void> {
    if (this.failSave) {
      // Simulate the one-pending-per-task unique-index conflict a concurrent
      // writer would trigger.
      return Promise.reject(new Error("UNIQUE constraint failed"));
    }
    this.saved.push(r);
    return Promise.resolve();
  }
  findPendingByTask(): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(null);
  }
  findCurrentByTask(): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(this.current);
  }
  findByTaskAndCycle(
    _taskId: MaintenanceTaskId,
    nextDue: string,
  ): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(this.byCycle && this.byCycle.nextDue === nextDue ? this.byCycle : null);
  }
  findCurrentByTasks(): Promise<ScheduledReminderRecord[]> {
    return Promise.resolve([]);
  }
  findDue(): Promise<ScheduledReminderRecord[]> {
    return Promise.resolve([]);
  }
  updateStatus(
    id: ScheduledReminderId,
    status: ScheduledReminderStatus,
    updatedAt: Date,
  ): Promise<void> {
    this.statusUpdates.push({ id, status, updatedAt });
    return Promise.resolve();
  }
  updateSnapshot(
    id: ScheduledReminderId,
    snapshot: Pick<ScheduledReminderRecord, "assetName" | "assetType" | "taskTitle" | "actorId">,
    provenance: Pick<ScheduledReminderRecord, "lastEventId" | "lastEventOccurredAt">,
    updatedAt: Date,
  ): Promise<void> {
    this.snapshots.push({
      id,
      taskTitle: snapshot.taskTitle,
      lastEventId: provenance.lastEventId,
      updatedAt,
    });
    return Promise.resolve();
  }
  snooze(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class EventLogFake implements NotificationEventLog {
  readonly processed: string[] = [];
  constructor(
    private processedIds: Set<string> = new Set(),
    private maxOccurred: Date | null = null,
  ) {}
  hasProcessed(eventId: string): Promise<boolean> {
    return Promise.resolve(this.processedIds.has(eventId));
  }
  maxOccurredAtForTask(): Promise<Date | null> {
    return Promise.resolve(this.maxOccurred);
  }
  recordProcessed(entry: { eventId: string }): Promise<void> {
    this.processed.push(entry.eventId);
    return Promise.resolve();
  }
}

const clock: Clock = { now: () => new Date("2026-09-01T00:00:00.000Z") };

function scheduleCmd(
  over: Partial<Extract<IngestMaintenanceReminderEventCommand, { kind: "schedule" }>> = {},
): IngestMaintenanceReminderEventCommand {
  return {
    kind: "schedule",
    eventId: "evt-1",
    occurredAt: new Date("2026-09-01T00:00:00.000Z"),
    ownerId: UserId.generate(),
    actorId: "system",
    taskId,
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-10-01",
    ...over,
  };
}

function reminder(
  overrides: Partial<ScheduledReminderRecord> = {},
  forTaskId: MaintenanceTaskId = taskId,
): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    maintenanceTaskId: forTaskId,
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-08-01",
    fireAt: "2026-07-25",
    status: "pending",
    snoozedUntil: null,
    lastEventId: "old",
    lastEventOccurredAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("IngestMaintenanceReminderEvent", () => {
  it("schedules a pending reminder with fireAt = nextDue - lead", async () => {
    const reminders = new ReminderRepoFake();
    const log = new EventLogFake();
    const result = await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd(),
    );

    expect(result.ok).toBe(true);
    expect(reminders.saved).toHaveLength(1);
    expect(reminders.saved[0]).toMatchObject({
      status: "pending",
      snoozedUntil: null,
      nextDue: "2026-10-01",
      fireAt: "2026-09-24",
      taskTitle: "Oil change",
    });
    expect(log.processed).toEqual(["evt-1"]);
  });

  it("is a no-op on a redelivered (already processed) event", async () => {
    const reminders = new ReminderRepoFake();
    const log = new EventLogFake(new Set(["evt-1"]));
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(scheduleCmd());

    expect(reminders.saved).toHaveLength(0);
    expect(log.processed).toHaveLength(0);
  });

  it("reschedules by superseding the prior pending reminder", async () => {
    const prior = reminder();
    const reminders = new ReminderRepoFake(prior);
    const log = new EventLogFake(new Set(), new Date("2026-06-01T00:00:00.000Z"));
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-2", occurredAt: new Date("2026-09-01T00:00:00.000Z") }),
    );

    expect(reminders.statusUpdates).toEqual([
      { id: prior.id, status: "superseded", updatedAt: clock.now() },
    ]);
    expect(reminders.saved).toHaveLength(1);
  });

  it("preserves a snoozed pending cycle when the event has the same nextDue (title-only edit)", async () => {
    const current = reminder({ nextDue: "2026-10-01", snoozedUntil: "2026-09-02" });
    const reminders = new ReminderRepoFake(current);
    const log = new EventLogFake();
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-rename", taskTitle: "Oil change (renamed)" }),
    );

    // The cycle row is kept: no supersede, no new row, snooze untouched.
    expect(reminders.statusUpdates).toHaveLength(0);
    expect(reminders.saved).toHaveLength(0);
    expect(reminders.snapshots).toEqual([
      {
        id: current.id,
        taskTitle: "Oil change (renamed)",
        lastEventId: "evt-rename",
        updatedAt: clock.now(),
      },
    ]);
    expect(log.processed).toEqual(["evt-rename"]);
  });

  it("reactivates a superseded row for a previously seen cycle and drops its stale snooze", async () => {
    const seen = reminder({
      nextDue: "2026-10-01",
      status: "superseded",
      snoozedUntil: "2026-08-15",
    });
    const reminders = new ReminderRepoFake(seen);
    const log = new EventLogFake();
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(scheduleCmd());

    // Reactivation is a status transition (which clears snoozed_until in D1),
    // followed by a snapshot refresh; never a duplicate insert.
    expect(reminders.statusUpdates).toEqual([
      { id: seen.id, status: "pending", updatedAt: clock.now() },
    ]);
    expect(reminders.snapshots).toHaveLength(1);
    expect(reminders.saved).toHaveLength(0);
  });

  it("leaves a fired cycle unchanged when the event has the same nextDue", async () => {
    const fired = reminder({ nextDue: "2026-10-01", status: "fired" });
    const reminders = new ReminderRepoFake(fired);
    const log = new EventLogFake();
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-again" }),
    );

    expect(reminders.statusUpdates).toHaveLength(0);
    expect(reminders.snapshots).toHaveLength(0);
    expect(reminders.saved).toHaveLength(0);
    expect(log.processed).toEqual(["evt-again"]);
  });

  it("reuses a previously seen unfired cycle instead of inserting a duplicate on rewind", async () => {
    const priorPending = reminder({ nextDue: "2026-08-01" });
    const seenSuperseded = reminder({
      nextDue: "2026-10-01",
      status: "superseded",
      snoozedUntil: "2026-08-15",
    });
    const reminders = new ReminderRepoFake(priorPending, seenSuperseded);
    const log = new EventLogFake();
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-rewind", nextDue: "2026-10-01" }),
    );

    // The current pending cycle is superseded, and the previously seen cycle is
    // reactivated (clearing its stale snooze) rather than inserted again.
    expect(reminders.statusUpdates).toEqual([
      { id: priorPending.id, status: "superseded", updatedAt: clock.now() },
      { id: seenSuperseded.id, status: "pending", updatedAt: clock.now() },
    ]);
    expect(reminders.snapshots).toHaveLength(1);
    expect(reminders.saved).toHaveLength(0);
  });

  it("cancels the pending reminder on a delete", async () => {
    const prior = reminder();
    const reminders = new ReminderRepoFake(prior);
    const log = new EventLogFake(new Set(), new Date("2026-06-01T00:00:00.000Z"));
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute({
      kind: "cancel",
      eventId: "evt-del",
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
      taskId,
    });

    expect(reminders.statusUpdates).toEqual([
      { id: prior.id, status: "canceled", updatedAt: clock.now() },
    ]);
    expect(reminders.saved).toHaveLength(0);
    expect(log.processed).toEqual(["evt-del"]);
  });

  it("cancels an already-fired current cycle on a delete so it can never re-arm", async () => {
    const fired = reminder({ status: "fired", snoozedUntil: "2026-09-02" });
    const reminders = new ReminderRepoFake(fired);
    const log = new EventLogFake();
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute({
      kind: "cancel",
      eventId: "evt-del",
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
      taskId,
    });

    expect(reminders.statusUpdates).toEqual([
      { id: fired.id, status: "canceled", updatedAt: clock.now() },
    ]);
    expect(reminders.saved).toHaveLength(0);
  });

  it("ignores a stale (older) event but still records it as processed", async () => {
    const reminders = new ReminderRepoFake();
    // a newer event already processed at 2026-09-05
    const log = new EventLogFake(new Set(), new Date("2026-09-05T00:00:00.000Z"));
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-late", occurredAt: new Date("2026-09-01T00:00:00.000Z") }),
    );

    expect(reminders.saved).toHaveLength(0);
    expect(reminders.statusUpdates).toHaveLength(0);
    expect(log.processed).toEqual(["evt-late"]);
  });

  it("returns err and does not record the event when a concurrent save conflicts", async () => {
    // A racing writer already created the pending reminder → the unique index
    // rejects this save. The use case must surface err (not throw) and leave the
    // event unrecorded so redelivery reconciles it.
    const reminders = new ReminderRepoFake(null, null, true);
    const log = new EventLogFake();
    const result = await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd(),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(InvariantError);
    expect(log.processed).toHaveLength(0);
  });

  it("lets a late advance lose to an already-processed delete", async () => {
    const reminders = new ReminderRepoFake();
    // delete already processed at a later occurrence time
    const log = new EventLogFake(new Set(), new Date("2026-09-10T00:00:00.000Z"));
    await new IngestMaintenanceReminderEvent(reminders, log, clock).execute(
      scheduleCmd({ eventId: "evt-adv", occurredAt: new Date("2026-09-05T00:00:00.000Z") }),
    );

    expect(reminders.saved).toHaveLength(0);
  });
});
