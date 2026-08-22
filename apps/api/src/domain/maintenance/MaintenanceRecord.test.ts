import { describe, expect, it } from "vitest";
import { AssetId, InvariantError, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../asset/AssetType.ts";
import { MaintenanceRecord } from "./MaintenanceRecord.ts";

describe("MaintenanceRecord", () => {
  const assetId = AssetId.generate();
  const ownerId = UserId.generate();
  const assetName = "Truck";
  const assetType: AssetType = "vehicle";

  function create(
    overrides: Partial<Parameters<typeof MaintenanceRecord.create>[0]> = {},
  ): MaintenanceRecord {
    return MaintenanceRecord.create({
      assetId,
      ownerId,
      actorId: ownerId,
      assetName,
      assetType,
      title: "Changed oil",
      performedAt: "2026-06-09",
      todayUtc: "2026-06-09",
      ...overrides,
    });
  }

  it("trims fields, converts blank notes to null, and emits the creation event", () => {
    const record = create({ title: "  Changed oil  ", notes: "   " });

    expect(record.title).toBe("Changed oil");
    expect(record.notes).toBeNull();
    expect(record.pullEvents()).toEqual([
      expect.objectContaining({
        type: "MaintenanceRecordCreated",
        maintenanceRecordId: record.id,
        assetId,
        ownerId,
        actorId: ownerId,
        assetName,
        assetType,
        title: "Changed oil",
        performedAt: "2026-06-09",
        taskId: null,
        activityEntryType: "maintenance_logged",
      }),
    ]);
  });

  it("accepts title and notes at their maximum lengths", () => {
    const record = create({ title: "t".repeat(100), notes: "n".repeat(1000) });
    expect(record.title).toHaveLength(100);
    expect(record.notes).toHaveLength(1000);
  });

  it.each([
    [{ title: "   " }, "title"],
    [{ title: "t".repeat(101) }, "title"],
    [{ notes: "n".repeat(1001) }, "notes"],
    [{ performedAt: "2026-6-09" }, "performedAt"],
    [{ performedAt: "0000-01-01" }, "performedAt"],
    [{ performedAt: "2026-02-29" }, "performedAt"],
    [{ performedAt: "2026-06-10" }, "performedAt"],
  ])("rejects invalid input %o", (overrides, field) => {
    try {
      create(overrides);
      expect.fail("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe(field);
    }
  });

  it("accepts a leap day in a leap year", () => {
    expect(create({ performedAt: "2024-02-29" }).performedAt).toBe("2024-02-29");
  });

  it("rejects an invalid UTC date provider value as an invariant error", () => {
    expect(() => create({ todayUtc: "not-a-date" })).toThrow(InvariantError);
  });

  it("reconstitutes without emitting an event", () => {
    const original = create();
    original.pullEvents();

    const record = MaintenanceRecord.reconstitute({
      id: original.id,
      assetId: original.assetId,
      ownerId: original.ownerId,
      title: original.title,
      performedAt: original.performedAt,
      notes: original.notes,
      taskId: null,
      createdAt: original.createdAt,
      revision: 2,
    });

    expect(record.pullEvents()).toEqual([]);
    expect(record.revision).toBe(2);
  });

  describe("update", () => {
    it("updates title, performedAt, notes, increments revision, and emits MaintenanceRecordUpdated", () => {
      const record = create({ title: "Old Title", performedAt: "2026-06-01", notes: "Old notes" });
      record.pullEvents();

      const actorId = UserId.generate();
      const updated = record.update(
        {
          title: "  New Title  ",
          performedAt: "2026-06-05",
          notes: "  New notes  ",
          todayUtc: "2026-06-09",
        },
        actorId,
        { assetName: "Truck", assetType: "vehicle" },
      );

      expect(updated).toBe(true);
      expect(record.title).toBe("New Title");
      expect(record.performedAt).toBe("2026-06-05");
      expect(record.notes).toBe("New notes");
      expect(record.revision).toBe(1);

      const events = record.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "MaintenanceRecordUpdated",
        maintenanceRecordId: record.id,
        assetId,
        ownerId,
        actorId,
        assetName,
        assetType,
        recordRevision: 1,
        before: { title: "Old Title", performedAt: "2026-06-01", notes: "Old notes" },
        after: { title: "New Title", performedAt: "2026-06-05", notes: "New notes" },
        activityEntryType: "maintenance_record_updated",
      });
    });

    it("clears notes when given explicit null or whitespace", () => {
      const record = create({ notes: "Some notes" });
      record.pullEvents();

      record.update({ notes: "   ", todayUtc: "2026-06-09" }, ownerId, { assetName, assetType });
      expect(record.notes).toBeNull();
    });

    it("returns false and emits no event when values are unchanged (no-op)", () => {
      const record = create({ title: "Same", performedAt: "2026-06-01", notes: "Same" });
      record.pullEvents();

      const updated = record.update(
        { title: "Same", performedAt: "2026-06-01", notes: "Same", todayUtc: "2026-06-09" },
        ownerId,
        { assetName, assetType },
      );

      expect(updated).toBe(false);
      expect(record.revision).toBe(0);
      expect(record.pullEvents()).toHaveLength(0);
    });

    it.each([
      [{ title: "   " }, "title"],
      [{ title: "t".repeat(101) }, "title"],
      [{ notes: "n".repeat(1001) }, "notes"],
      [{ performedAt: "2026-6-09" }, "performedAt"],
      [{ performedAt: "2026-06-10" }, "performedAt"],
    ])("rejects invalid update input %o", (overrides, field) => {
      const record = create();
      record.pullEvents();

      try {
        record.update({ todayUtc: "2026-06-09", ...overrides }, ownerId, { assetName, assetType });
        expect.fail("Expected validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe(field);
      }
    });
  });

  describe("delete", () => {
    it("increments revision and emits MaintenanceRecordDeleted with snapshot", () => {
      const record = create({ title: "To Delete", performedAt: "2026-06-01", notes: "Note" });
      record.pullEvents();

      const actorId = UserId.generate();
      record.delete(actorId, { assetName, assetType });

      expect(record.revision).toBe(1);
      const events = record.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "MaintenanceRecordDeleted",
        maintenanceRecordId: record.id,
        assetId,
        ownerId,
        actorId,
        assetName,
        assetType,
        recordRevision: 1,
        deleted: { title: "To Delete", performedAt: "2026-06-01", notes: "Note" },
        activityEntryType: "maintenance_record_deleted",
      });
    });
  });
});
