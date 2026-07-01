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
  });

  it("throws ValidationError for title over 100 chars", () => {
    expect(() => makeTask({ title: "a".repeat(101) })).toThrow(ValidationError);
  });

  it("throws ValidationError for intervalValue of 0", () => {
    expect(() => makeTask({ intervalValue: 0 })).toThrow(ValidationError);
  });

  it("throws ValidationError for negative intervalValue", () => {
    expect(() => makeTask({ intervalValue: -1 })).toThrow(ValidationError);
  });

  it("throws ValidationError for non-integer intervalValue", () => {
    expect(() => makeTask({ intervalValue: 1.5 })).toThrow(ValidationError);
  });

  it("throws ValidationError for future lastCompletedDate", () => {
    expect(() => makeTask({ lastCompletedDate: "2026-12-31" })).toThrow(ValidationError);
  });

  it("throws ValidationError for malformed lastCompletedDate", () => {
    expect(() => makeTask({ lastCompletedDate: "not-a-date" })).toThrow(ValidationError);
  });
});

describe("MaintenanceTask.advance", () => {
  it("advances lastCompletedDate and nextDue when performedAt is newer", () => {
    const task = makeTask({ lastCompletedDate: "2026-04-11" });
    const recordId = MaintenanceRecordId.generate();
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
    });
  });

  it("does not advance when performedAt equals lastCompletedDate", () => {
    const task = makeTask({ lastCompletedDate: "2026-06-11" });
    task.pullEvents(); // clear create event
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
    const result = task.advance("2026-05-01", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(result).toBe(false);
    expect(task.lastCompletedDate).toBe("2026-06-11");
  });

  it("advances when lastCompletedDate is null (first ever record)", () => {
    const task = makeTask();
    const result = task.advance("2026-06-01", MaintenanceRecordId.generate(), actorId, {
      assetName,
      assetType,
    });
    expect(result).toBe(true);
    expect(task.lastCompletedDate).toBe("2026-06-01");
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
