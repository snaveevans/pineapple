import {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { NotificationType, ScheduledReminderStatus } from "../notifications/notificationTypes.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { EmailBatchRecord } from "../ports/EmailBatchRepository.ts";
import type { NotificationRecord } from "../ports/NotificationRepository.ts";
import type {
  ReminderSweepNotificationCandidate,
  ReminderSweepPersistenceInput,
  ReminderSweepPersistenceResult,
  ReminderSweepStore,
} from "../ports/ReminderSweepStore.ts";
import type {
  ScheduledReminderRecord,
} from "../ports/ScheduledReminderRepository.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { SweepMaintenanceReminders } from "./SweepMaintenanceReminders.ts";

class ReminderSweepStoreFake implements ReminderSweepStore {
  readonly statusUpdates: { id: ScheduledReminderId; status: ScheduledReminderStatus }[] = [];
  readonly inserted: NotificationRecord[] = [];
  readonly recordInputs: ReminderSweepPersistenceInput[] = [];
  todayRequested: string | null = null;

  constructor(
    private readonly due: ScheduledReminderRecord[],
    private readonly insertResults: boolean[] = [],
  ) {}

  findDue(today: string): Promise<ScheduledReminderRecord[]> {
    this.todayRequested = today;
    return Promise.resolve(this.due);
  }

  recordDueReminderSweep(input: ReminderSweepPersistenceInput): Promise<ReminderSweepPersistenceResult> {
    this.recordInputs.push(input);
    const createdCandidates: ReminderSweepNotificationCandidate[] = [];

    for (const candidate of input.candidates) {
      this.statusUpdates.push({ id: candidate.reminderId, status: "fired" });
      const inserted = this.insertResults.shift() ?? true;
      this.inserted.push(candidate.notification);
      if (inserted) createdCandidates.push(candidate);
    }

    const counts = countByBatch(createdCandidates);
    const emailBatches: EmailBatchRecord[] = input.emailBatches
      .map((batch) => ({
        ...batch,
        status: "pending" as const,
        suppressReason: null,
        notificationCount: counts.get(batch.id) ?? 0,
      }))
      .filter((batch) => batch.notificationCount > 0);

    return Promise.resolve({
      createdNotifications: createdCandidates.map((candidate) => candidate.notification),
      emailBatches,
    });
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

const dates: UtcDateProvider = { today: () => "2026-07-02" };
const now = new Date("2026-07-02T10:30:00.000Z");
const clock: Clock = { now: () => now };

function reminder(overrides: Partial<ScheduledReminderRecord> = {}): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.generate(),
    ownerId: UserId.generate(),
    actorId: "source-user",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-09",
    fireAt: "2026-07-02",
    status: "pending",
    lastEventId: "evt-1",
    lastEventOccurredAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("SweepMaintenanceReminders", () => {
  it("creates due in-app notifications from scheduled reminder snapshots and marks reminders fired", async () => {
    const ownerId = UserId.generate();
    const due = [
      reminder({
        ownerId,
        assetName: "Van",
        assetType: "vehicle",
        taskTitle: "Rotate tires",
        nextDue: "2026-07-09",
      }),
    ];
    const store = new ReminderSweepStoreFake(due);
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      store,
      dates,
      clock,
      events,
    ).execute();

    expect(result.ok).toBe(true);
    expect(store.todayRequested).toBe("2026-07-02");
    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]).toMatchObject({
      ownerId,
      actorId: "system",
      type: "maintenance_due_soon" satisfies NotificationType,
      maintenanceTaskId: due[0]?.maintenanceTaskId,
      assetId: due[0]?.assetId,
      assetName: "Van",
      assetType: "vehicle",
      taskTitle: "Rotate tires",
      nextDue: "2026-07-09",
      createdAt: now,
      readAt: null,
    });
    expect(store.statusUpdates).toEqual([{ id: due[0]?.id, status: "fired" }]);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceReminderCreated",
      notificationId: store.inserted[0]?.id,
      notificationType: "maintenance_due_soon",
      maintenanceTaskId: due[0]?.maintenanceTaskId,
      assetId: due[0]?.assetId,
      ownerId,
      actorId: "system",
      leadDays: 7,
    });
    if (!result.ok) throw result.error;
    expect(result.value.emailBatches).toEqual([
      expect.objectContaining({ ownerId, status: "pending", notificationCount: 1 }),
    ]);
  });

  it("creates one email batch per owner per sweep while keeping one notification per task", async () => {
    const ownerA = UserId.generate();
    const ownerB = UserId.generate();
    const due = [reminder({ ownerId: ownerA }), reminder({ ownerId: ownerA }), reminder({ ownerId: ownerB })];
    const store = new ReminderSweepStoreFake(due);
    const result = await new SweepMaintenanceReminders(
      store,
      dates,
      clock,
      new EventBusFake(),
    ).execute();

    if (!result.ok) throw result.error;

    expect(result.value.createdCount).toBe(3);
    expect(result.value.createdByOwner).toHaveLength(2);
    expect(result.value.createdByOwner.map((group) => [group.ownerId, group.notifications.length])).toEqual([
      [ownerA, 2],
      [ownerB, 1],
    ]);
    expect(result.value.emailBatches.map((batch) => [batch.ownerId, batch.notificationCount])).toEqual([
      [ownerA, 2],
      [ownerB, 1],
    ]);
    const recorded = store.recordInputs[0];
    expect(recorded?.emailBatches).toHaveLength(2);
    const ownerABatchIds = recorded?.candidates
      .filter((candidate) => candidate.notification.ownerId === ownerA)
      .map((candidate) => candidate.emailBatchId);
    expect(new Set(ownerABatchIds).size).toBe(1);
  });

  it("marks duplicate pending reminders fired without publishing created events or duplicate batches", async () => {
    const due = [reminder(), reminder()];
    const store = new ReminderSweepStoreFake(due, [false, true]);
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      store,
      dates,
      clock,
      events,
    ).execute();

    if (!result.ok) throw result.error;

    expect(store.inserted).toHaveLength(2);
    expect(store.statusUpdates).toEqual([
      { id: due[0]?.id, status: "fired" },
      { id: due[1]?.id, status: "fired" },
    ]);
    expect(result.value.createdCount).toBe(1);
    expect(result.value.emailBatches).toEqual([
      expect.objectContaining({ notificationCount: 1, status: "pending" }),
    ]);
    expect(events.events).toHaveLength(1);
  });

  it("does not create notifications for canceled, superseded, or future reminders because the repository only returns due pending rows", async () => {
    const store = new ReminderSweepStoreFake([]);
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      store,
      dates,
      clock,
      events,
    ).execute();

    if (!result.ok) throw result.error;

    expect(result.value).toEqual({
      today: "2026-07-02",
      createdCount: 0,
      createdByOwner: [],
      emailBatches: [],
    });
    expect(store.inserted).toHaveLength(0);
    expect(store.statusUpdates).toHaveLength(0);
    expect(store.recordInputs).toEqual([
      { candidates: [], emailBatches: [], updatedAt: now },
    ]);
    expect(events.events).toHaveLength(0);
  });
});

function countByBatch(candidates: ReminderSweepNotificationCandidate[]): Map<EmailBatchId, number> {
  const counts = new Map<EmailBatchId, number>();
  for (const candidate of candidates) {
    counts.set(candidate.emailBatchId, (counts.get(candidate.emailBatchId) ?? 0) + 1);
  }
  return counts;
}
