import {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { NotificationType, ScheduledReminderStatus } from "../notifications/notificationTypes.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import type {
  ScheduledReminderRecord,
  ScheduledReminderRepository,
} from "../ports/ScheduledReminderRepository.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";
import { SweepMaintenanceReminders } from "./SweepMaintenanceReminders.ts";

class ReminderRepoFake implements ScheduledReminderRepository {
  readonly statusUpdates: { id: ScheduledReminderId; status: ScheduledReminderStatus }[] = [];
  todayRequested: string | null = null;

  constructor(private readonly due: ScheduledReminderRecord[]) {}

  save(): Promise<void> {
    return Promise.resolve();
  }

  findPendingByTask(): Promise<ScheduledReminderRecord | null> {
    return Promise.resolve(null);
  }

  findDue(today: string): Promise<ScheduledReminderRecord[]> {
    this.todayRequested = today;
    return Promise.resolve(this.due);
  }

  updateStatus(id: ScheduledReminderId, status: ScheduledReminderStatus): Promise<void> {
    this.statusUpdates.push({ id, status });
    return Promise.resolve();
  }
}

class NotificationRepoFake implements NotificationRepository {
  readonly inserted: NotificationRecord[] = [];

  constructor(private readonly insertResults: boolean[] = []) {}

  insertIfAbsent(notification: NotificationRecord): Promise<boolean> {
    this.inserted.push(notification);
    return Promise.resolve(this.insertResults.shift() ?? true);
  }

  findByIdForOwner(): Promise<NotificationRecord | null> {
    return Promise.resolve(null);
  }

  listByOwner(): Promise<NotificationPage> {
    return Promise.resolve({ notifications: [], nextCursor: null });
  }

  countUnread(): Promise<number> {
    return Promise.resolve(0);
  }

  markRead(): Promise<void> {
    return Promise.resolve();
  }

  markAllRead(): Promise<void> {
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
    const reminders = new ReminderRepoFake(due);
    const notifications = new NotificationRepoFake();
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      reminders,
      notifications,
      dates,
      clock,
      events,
    ).execute();

    expect(result.ok).toBe(true);
    expect(reminders.todayRequested).toBe("2026-07-02");
    expect(notifications.inserted).toHaveLength(1);
    expect(notifications.inserted[0]).toMatchObject({
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
    expect(reminders.statusUpdates).toEqual([{ id: due[0]?.id, status: "fired" }]);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "MaintenanceReminderCreated",
      notificationId: notifications.inserted[0]?.id,
      notificationType: "maintenance_due_soon",
      maintenanceTaskId: due[0]?.maintenanceTaskId,
      assetId: due[0]?.assetId,
      ownerId,
      actorId: "system",
      leadDays: 7,
    });
  });

  it("groups only newly created notifications by owner", async () => {
    const ownerA = UserId.generate();
    const ownerB = UserId.generate();
    const due = [reminder({ ownerId: ownerA }), reminder({ ownerId: ownerA }), reminder({ ownerId: ownerB })];
    const result = await new SweepMaintenanceReminders(
      new ReminderRepoFake(due),
      new NotificationRepoFake(),
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
  });

  it("marks duplicate pending reminders fired without publishing created events", async () => {
    const due = [reminder(), reminder()];
    const reminders = new ReminderRepoFake(due);
    const notifications = new NotificationRepoFake([false, true]);
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      reminders,
      notifications,
      dates,
      clock,
      events,
    ).execute();

    if (!result.ok) throw result.error;

    expect(notifications.inserted).toHaveLength(2);
    expect(reminders.statusUpdates).toEqual([
      { id: due[0]?.id, status: "fired" },
      { id: due[1]?.id, status: "fired" },
    ]);
    expect(result.value.createdCount).toBe(1);
    expect(events.events).toHaveLength(1);
  });

  it("does not create notifications for canceled, superseded, or future reminders because the repository only returns due pending rows", async () => {
    const reminders = new ReminderRepoFake([]);
    const notifications = new NotificationRepoFake();
    const events = new EventBusFake();

    const result = await new SweepMaintenanceReminders(
      reminders,
      notifications,
      dates,
      clock,
      events,
    ).execute();

    if (!result.ok) throw result.error;

    expect(result.value).toEqual({ today: "2026-07-02", createdCount: 0, createdByOwner: [] });
    expect(notifications.inserted).toHaveLength(0);
    expect(reminders.statusUpdates).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });
});
