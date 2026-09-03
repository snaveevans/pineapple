import { describe, expect, it } from "vitest";
import {
  AssetId,
  MaintenanceRecordId,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { MaintenanceTask } from "./MaintenanceTask.ts";

const assetId = AssetId.generate();
const ownerId = UserId.generate();
const actorId = ownerId;
const assetName = "House";
const assetType = "property" as const;
const today = "2026-06-11";

function makeTask(overrides: Partial<Parameters<typeof MaintenanceTask.create>[0]> = {}) {
  return MaintenanceTask.create({
    assetId,
    ownerId,
    actorId,
    assetName,
    assetType,
    title: "Replace furnace filter",
    intervalValue: 2,
    intervalUnit: "month",
    todayUtc: today,
    ...overrides,
  });
}

describe("MaintenanceTask.create", () => {
  it("seeds nextDue from today when no lastCompletedDate provided", () => {
    const task = makeTask();
    expect(task.lastCompletedDate).toBeNull();
    expect(task.nextDue).toBe("2026-08-11");
  });

  it("seeds nextDue from lastCompletedDate when provided", () => {
    const task = makeTask({
      lastCompletedDate: "2026-04-11",
      intervalValue: 2,
      intervalUnit: "month",
    });
    expect(task.lastCompletedDate).toBe("2026-04-11");
    expect(task.nextDue).toBe("2026-06-11");
  });

  it("emits MaintenanceTaskCreated event", () => {
    const task = makeTask();
    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskCreated",
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "Replace furnace filter",
      nextDue: "2026-08-11",
    });
  });

  it("clears events after pullEvents", () => {
    const task = makeTask();
    task.pullEvents();
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("trims title", () => {
    const task = makeTask({ title: "  Oil change  " });
    expect(task.title).toBe("Oil change");
  });

  it("throws ValidationError for empty title", () => {
    expect(() => makeTask({ title: "   " })).toThrow(ValidationError);
    try {
      makeTask({ title: "   " });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("title");
    }
  });

  it("accepts a title of exactly 100 characters", () => {
    const title = "a".repeat(100);
    const task = makeTask({ title });
    expect(task.title).toBe(title);
    expect(task.title).toHaveLength(100);
  });

  it("throws ValidationError for title of 101 characters", () => {
    expect(() => makeTask({ title: "a".repeat(101) })).toThrow(ValidationError);
    try {
      makeTask({ title: "a".repeat(101) });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("title");
    }
  });

  it("accepts intervalValue of 1", () => {
    const task = makeTask({ intervalValue: 1, intervalUnit: "day" });
    expect(task.intervalValue).toBe(1);
    expect(task.nextDue).toBe("2026-06-12");
  });

  it("throws ValidationError for intervalValue of 0", () => {
    expect(() => makeTask({ intervalValue: 0 })).toThrow(ValidationError);
    try {
      makeTask({ intervalValue: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("intervalValue");
    }
  });

  it("throws ValidationError for negative intervalValue", () => {
    expect(() => makeTask({ intervalValue: -1 })).toThrow(ValidationError);
  });

  it("throws ValidationError for non-integer intervalValue", () => {
    expect(() => makeTask({ intervalValue: 1.5 })).toThrow(ValidationError);
  });

  it("throws ValidationError for invalid intervalUnit", () => {
    expect(() => makeTask({ intervalUnit: "fortnight" as "day" })).toThrow(ValidationError);
    try {
      makeTask({ intervalUnit: "fortnight" as "day" });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("intervalUnit");
    }
  });

  it("accepts lastCompletedDate equal to today", () => {
    const task = makeTask({ lastCompletedDate: today });
    expect(task.lastCompletedDate).toBe(today);
    expect(task.nextDue).toBe("2026-08-11");
  });

  it("throws ValidationError for future lastCompletedDate", () => {
    expect(() => makeTask({ lastCompletedDate: "2026-12-31" })).toThrow(ValidationError);
    try {
      makeTask({ lastCompletedDate: "2026-12-31" });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("lastCompletedDate");
    }
  });

  it("throws ValidationError for malformed lastCompletedDate", () => {
    expect(() => makeTask({ lastCompletedDate: "not-a-date" })).toThrow(ValidationError);
  });

  it("throws ValidationError for invalid calendar lastCompletedDate", () => {
    expect(() => makeTask({ lastCompletedDate: "2026-02-30" })).toThrow(ValidationError);
  });
});

describe("MaintenanceTask.advance", () => {
  it("advances lastCompletedDate and nextDue when performedAt is newer", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    const recordId = MaintenanceRecordId.generate();
    expect(task.willAdvance("2026-06-11")).toBe(true);

    const result = task.advance("2026-06-11", recordId, actorId, { assetName, assetType });

    expect(result).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-06-11");
    expect(task.nextDue).toBe("2026-08-11");
  });

  it("emits MaintenanceTaskAdvanced when advanced", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents(); // clear create event
    const recordId = MaintenanceRecordId.generate();
    task.advance("2026-06-11", recordId, actorId, { assetName, assetType });
    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskAdvanced",
      assetName,
      assetType,
      title: "Replace furnace filter",
      performedAt: "2026-06-11",
      nextDue: "2026-08-11",
    });
  });

  it("does not advance when performedAt equals lastCompletedDate", () => {
    const task = makeTask({ lastCompletedDate: "2026-06-11" });
    task.pullEvents(); // clear create event
    expect(task.willAdvance("2026-06-11")).toBe(false);

    const result = task.advance("2026-06-11", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(result).toBe(false);
    expect(task.nextDue).toBe("2026-08-11");
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("does not advance when performedAt is older than lastCompletedDate", () => {
    const task = makeTask({ lastCompletedDate: "2026-06-11" });
    expect(task.willAdvance("2026-05-01")).toBe(false);

    const result = task.advance("2026-05-01", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(result).toBe(false);
    expect(task.lastCompletedDate).toBe("2026-06-11");
  });

  it("advances when lastCompletedDate is null (first ever record)", () => {
    const task = makeTask();
    expect(task.willAdvance("2026-06-01")).toBe(true);

    const result = task.advance("2026-06-01", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(result).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-06-01");
  });
});

describe("MaintenanceTask.update", () => {
  it("changes only title, leaving lastCompletedDate and nextDue untouched", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents(); // clear create event
    const nextDueBefore = task.nextDue;

    const result = task.update({ title: "Replace filter", todayUtc: today }, actorId, {
      assetName,
      assetType,
    });

    expect(result).toBe(true);
    expect(task.title).toBe("Replace filter");
    expect(task.lastCompletedDate).toBe("2026-04-11");
    expect(task.nextDue).toBe(nextDueBefore);
  });

  it("does not shift nextDue when a title change resends the current (unchanged) interval, even with no lastCompletedDate", () => {
    // Regression: a client that always submits its full form state (title +
    // intervalValue + intervalUnit) must not trigger a recompute just because
    // intervalValue/intervalUnit were present in the request — only an actual
    // interval change should move nextDue. This matters most when
    // lastCompletedDate is null, since the recompute baseline would otherwise
    // silently shift from the original creation date to "today".
    const task = makeTask({ intervalValue: 2, intervalUnit: "month" });
    task.pullEvents();
    const nextDueBefore = task.nextDue;

    const result = task.update(
      {
        title: "Replace filter",
        intervalValue: 2,
        intervalUnit: "month",
        todayUtc: "2026-09-01", // well after task creation
      },
      actorId,
      { assetName, assetType },
    );

    expect(result).toBe(true);
    expect(task.title).toBe("Replace filter");
    expect(task.lastCompletedDate).toBeNull();
    expect(task.nextDue).toBe(nextDueBefore);
  });

  it("recomputes nextDue from lastCompletedDate when interval changes", () => {
    const task = makeTask({
      lastCompletedDate: "2026-04-11",
      intervalValue: 2,
      intervalUnit: "month",
    });
    task.pullEvents();

    const result = task.update({ intervalValue: 3, todayUtc: today }, actorId, {
      assetName,
      assetType,
    });

    expect(result).toBe(true);
    expect(task.intervalValue).toBe(3);
    expect(task.nextDue).toBe("2026-07-11");
  });

  it("recomputes nextDue from scheduleSeedDate when there is no lastCompletedDate", () => {
    const task = makeTask({ intervalValue: 2, intervalUnit: "month" });
    task.pullEvents();

    const result = task.update({ intervalValue: 1, todayUtc: "2026-07-01" }, actorId, {
      assetName,
      assetType,
    });

    expect(result).toBe(true);
    expect(task.nextDue).toBe("2026-07-11");
  });

  it("emits MaintenanceTaskUpdated when a value actually changes", () => {
    const task = makeTask();
    task.pullEvents();

    task.update({ title: "New title", todayUtc: today }, actorId, { assetName, assetType });
    const events = task.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskUpdated",
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "New title",
      nextDue: task.nextDue,
    });
  });

  it("is a no-op when the resulting values equal the current ones", () => {
    const task = makeTask({ intervalValue: 2, intervalUnit: "month" });
    task.pullEvents();

    const result = task.update(
      { title: "Replace furnace filter", intervalValue: 2, intervalUnit: "month", todayUtc: today },
      actorId,
      { assetName, assetType },
    );

    expect(result).toBe(false);
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("throws ValidationError for an empty title", () => {
    const task = makeTask();
    expect(() =>
      task.update({ title: "   ", todayUtc: today }, actorId, { assetName, assetType }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for an invalid intervalValue", () => {
    const task = makeTask();
    expect(() =>
      task.update({ intervalValue: 0, todayUtc: today }, actorId, { assetName, assetType }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for an invalid intervalUnit", () => {
    const task = makeTask();
    expect(() =>
      task.update({ intervalUnit: "fortnight" as "day", todayUtc: today }, actorId, {
        assetName,
        assetType,
      }),
    ).toThrow(ValidationError);
  });
});

describe("MaintenanceTask.remove", () => {
  it("emits MaintenanceTaskDeleted", () => {
    const task = makeTask();
    task.pullEvents(); // clear create event
    task.remove(actorId, { assetName, assetType });
    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskDeleted",
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "Replace furnace filter",
    });
  });
});

describe("addInterval calendar arithmetic", () => {
  it("adds days", () => {
    const task = MaintenanceTask.create({
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "T",
      intervalValue: 30,
      intervalUnit: "day",
      todayUtc: "2026-01-15",
    });
    expect(task.nextDue).toBe("2026-02-14");
  });

  it("adds weeks", () => {
    const task = MaintenanceTask.create({
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "T",
      intervalValue: 2,
      intervalUnit: "week",
      todayUtc: "2026-01-15",
    });
    expect(task.nextDue).toBe("2026-01-29");
  });

  it("adds months and clamps to month-end", () => {
    const task = MaintenanceTask.create({
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
      todayUtc: "2026-01-31",
    });
    expect(task.nextDue).toBe("2026-02-28");
  });

  it("adds years and clamps leap-day to Feb 28 in non-leap year", () => {
    const task = MaintenanceTask.create({
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "T",
      intervalValue: 1,
      intervalUnit: "year",
      todayUtc: "2024-02-29",
    });
    expect(task.nextDue).toBe("2025-02-28");
  });
});

describe("MaintenanceTask.reconcile", () => {
  it("rewinds to previous latest record when latest record is removed", () => {
    const task = makeTask({
      lastCompletedDate: "2026-01-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();

    const recordId = MaintenanceRecordId.generate();
    // Simulate advance from a 2026-03-01 record
    task.advance("2026-03-01", recordId, actorId, { assetName, assetType });
    expect(task.lastCompletedDate).toBe("2026-03-01");
    expect(task.nextDue).toBe("2026-04-01");
    task.pullEvents();

    // Reconcile with only an intermediate record at 2026-02-01 surviving
    const sourceRecordId = MaintenanceRecordId.generate();
    const changed = task.reconcile([{ performedAt: "2026-02-01" }], sourceRecordId, actorId, {
      assetName,
      assetType,
    });

    expect(changed).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-02-01");
    expect(task.nextDue).toBe("2026-03-01");

    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskReconciled",
      maintenanceTaskId: task.id,
      lastCompletedDate: "2026-02-01",
      nextDue: "2026-03-01",
      sourceRecordId,
      activityEntryType: null,
    });
  });

  it("rewinds to initial seed when all surviving records are deleted on seeded task", () => {
    const task = makeTask({
      lastCompletedDate: "2026-01-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();

    task.advance("2026-03-01", MaintenanceRecordId.generate(), actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.reconcile([], MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(changed).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-01-01");
    expect(task.nextDue).toBe("2026-02-01");
  });

  it("becomes null and uses scheduleSeedDate when all records deleted on unseeded task", () => {
    const task = makeTask({
      intervalValue: 1,
      intervalUnit: "month",
      todayUtc: "2026-06-01",
    });
    task.pullEvents();

    expect(task.scheduleSeedDate).toBe("2026-06-01");
    expect(task.initialLastCompletedDate).toBeNull();

    task.advance("2026-06-15", MaintenanceRecordId.generate(), actorId, { assetName, assetType });
    expect(task.lastCompletedDate).toBe("2026-06-15");
    expect(task.nextDue).toBe("2026-07-15");
    task.pullEvents();

    const changed = task.reconcile([], MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(changed).toBe(true);
    expect(task.lastCompletedDate).toBeNull();
    expect(task.nextDue).toBe("2026-07-01"); // 2026-06-01 + 1 month
  });

  it("returns false and emits no event when surviving records produce same lastCompletedDate and nextDue", () => {
    const task = makeTask({
      lastCompletedDate: "2026-01-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();

    task.advance("2026-03-01", MaintenanceRecordId.generate(), actorId, { assetName, assetType });
    task.pullEvents();

    // Reconcile where latest surviving is still 2026-03-01
    const changed = task.reconcile(
      [{ performedAt: "2026-02-01" }, { performedAt: "2026-03-01" }],
      MaintenanceRecordId.generate(),
      actorId,
      { assetName, assetType },
    );

    expect(changed).toBe(false);
    expect(task.pullEvents()).toHaveLength(0);
  });
});

describe("MaintenanceTask.reschedule", () => {
  it("sets the override as the effective nextDue and leaves completion evidence unchanged", () => {
    const task = makeTask({
      lastCompletedDate: "2026-01-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();

    const changed = task.reschedule("2026-09-15", today, actorId, { assetName, assetType });

    expect(changed).toBe(true);
    expect(task.nextDue).toBe("2026-09-15");
    expect(task.nextDueOverride).toBe("2026-09-15");
    expect(task.lastCompletedDate).toBe("2026-01-01");
    expect(task.scheduleSeedDate).toBe("2026-01-01");
    expect(task.initialLastCompletedDate).toBe("2026-01-01");
    expect(task.revision).toBe(1);
  });

  it("emits MaintenanceTaskRescheduled with snapshots, resulting nextDue, and taskRevision", () => {
    const task = makeTask();
    task.pullEvents();

    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });

    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskRescheduled",
      maintenanceTaskId: task.id,
      assetId,
      ownerId,
      actorId,
      assetName,
      assetType,
      title: "Replace furnace filter",
      nextDue: "2026-09-15",
      taskRevision: 1,
      activityEntryType: "task_rescheduled",
    });
    // Rescheduling never manufactures completion evidence: the event carries
    // no lastCompletedDate.
    expect(events[0] && "lastCompletedDate" in events[0]).toBe(false);
  });

  it("throws ValidationError for a past target", () => {
    const task = makeTask();
    task.pullEvents();
    expect(() => task.reschedule("2026-06-10", today, actorId, { assetName, assetType })).toThrow(
      ValidationError,
    );
    try {
      task.reschedule("2026-06-10", today, actorId, { assetName, assetType });
    } catch (error) {
      expect((error as ValidationError).field).toBe("nextDue");
    }
  });

  it("throws ValidationError for a target equal to today", () => {
    const task = makeTask();
    task.pullEvents();
    expect(() => task.reschedule("2026-06-11", today, actorId, { assetName, assetType })).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for a malformed target", () => {
    const task = makeTask();
    task.pullEvents();
    expect(() => task.reschedule("2026-13-45", today, actorId, { assetName, assetType })).toThrow(
      ValidationError,
    );
    expect(() => task.reschedule("not-a-date", today, actorId, { assetName, assetType })).toThrow(
      ValidationError,
    );
  });

  it("is a no-op when the target equals the current effective nextDue", () => {
    const task = makeTask({ lastCompletedDate: "2026-05-11" });
    task.pullEvents();
    expect(task.nextDue).toBe("2026-07-11");

    const changed = task.reschedule("2026-07-11", today, actorId, { assetName, assetType });

    expect(changed).toBe(false);
    expect(task.nextDueOverride).toBeNull();
    expect(task.revision).toBe(0);
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("replacing an existing override is not a no-op", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.reschedule("2026-10-01", today, actorId, { assetName, assetType });

    expect(changed).toBe(true);
    expect(task.nextDueOverride).toBe("2026-10-01");
    expect(task.revision).toBe(2);
    expect(task.pullEvents()).toHaveLength(1);
  });

  it("an interval edit clears the override and recomputes from the completion baseline", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.update({ intervalValue: 3, todayUtc: today }, actorId, {
      assetName,
      assetType,
    });

    expect(changed).toBe(true);
    expect(task.nextDueOverride).toBeNull();
    expect(task.nextDue).toBe("2026-07-11"); // 2026-04-11 + 3 months
    expect(task.revision).toBe(2);
  });

  it("a title-only edit leaves the override and effective nextDue unchanged", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.update({ title: "New title", todayUtc: today }, actorId, {
      assetName,
      assetType,
    });

    expect(changed).toBe(true);
    expect(task.nextDueOverride).toBe("2026-09-15");
    expect(task.nextDue).toBe("2026-09-15");
  });

  it("a successful advance clears the override and derives nextDue from performedAt", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const advanced = task.advance("2026-06-20", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });

    expect(advanced).toBe(true);
    expect(task.nextDueOverride).toBeNull();
    expect(task.lastCompletedDate).toBe("2026-06-20");
    expect(task.nextDue).toBe("2026-08-20"); // 2026-06-20 + 2 months
  });

  it("linking an older record that does not advance leaves the override intact", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const advanced = task.advance("2026-03-01", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });

    expect(advanced).toBe(false);
    expect(task.nextDueOverride).toBe("2026-09-15");
    expect(task.nextDue).toBe("2026-09-15");
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("record correction recomputes completion but keeps the override as effective nextDue", () => {
    const task = makeTask({
      lastCompletedDate: "2026-01-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.reconcile(
      [{ performedAt: "2026-03-01" }],
      MaintenanceRecordId.generate(),
      actorId,
      { assetName, assetType },
    );

    expect(changed).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-03-01");
    expect(task.nextDueOverride).toBe("2026-09-15");
    expect(task.nextDue).toBe("2026-09-15");

    const events = task.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "MaintenanceTaskReconciled",
      lastCompletedDate: "2026-03-01",
      nextDue: "2026-09-15",
    });
  });

  it("reconcile does not publish when the override already equals the derived schedule", () => {
    const task = makeTask({
      lastCompletedDate: "2026-06-01",
      intervalValue: 1,
      intervalUnit: "month",
    });
    task.pullEvents();
    // Derived nextDue is 2026-07-01; override to exactly that date
    task.reschedule("2026-07-01", today, actorId, { assetName, assetType });
    task.pullEvents();

    const changed = task.reconcile(
      [{ performedAt: "2026-06-01" }],
      MaintenanceRecordId.generate(),
      actorId,
      { assetName, assetType },
    );

    expect(changed).toBe(false);
    expect(task.pullEvents()).toHaveLength(0);
  });

  it("reconstitute round-trips the override", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    task.pullEvents();
    task.reschedule("2026-09-15", today, actorId, { assetName, assetType });

    const restored = MaintenanceTask.reconstitute({
      id: task.id,
      assetId: task.assetId,
      ownerId: task.ownerId,
      title: task.title,
      intervalValue: task.intervalValue,
      intervalUnit: task.intervalUnit,
      lastCompletedDate: task.lastCompletedDate,
      nextDue: task.nextDue,
      createdAt: task.createdAt,
      scheduleSeedDate: task.scheduleSeedDate,
      initialLastCompletedDate: task.initialLastCompletedDate,
      revision: task.revision,
      nextDueOverride: task.nextDueOverride,
    });

    expect(restored.nextDueOverride).toBe("2026-09-15");
    expect(restored.nextDue).toBe("2026-09-15");
  });
});
