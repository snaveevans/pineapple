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
  constructor(
    private pending: ScheduledReminderRecord | null = null,
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
    return Promise.resolve(this.pending);
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

function pendingReminder(): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    maintenanceTaskId: taskId,
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-08-01",
    fireAt: "2026-07-25",
    status: "pending",
    lastEventId: "old",
    lastEventOccurredAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
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
    const prior = pendingReminder();
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

  it("cancels the pending reminder on a delete", async () => {
    const prior = pendingReminder();
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
    const reminders = new ReminderRepoFake(null, true);
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
