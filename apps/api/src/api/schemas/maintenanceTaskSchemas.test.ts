import { describe, expect, it } from "vitest";
import {
  RescheduleMaintenanceTaskBodySchema,
  UpdateMaintenanceTaskBodySchema,
} from "./maintenanceTaskSchemas.ts";

describe("UpdateMaintenanceTaskBodySchema", () => {
  it("accepts a title-only body", () => {
    expect(UpdateMaintenanceTaskBodySchema.parse({ title: "Replace filter" })).toEqual({
      title: "Replace filter",
    });
  });

  it("accepts an interval-only body", () => {
    expect(
      UpdateMaintenanceTaskBodySchema.parse({ intervalValue: 3, intervalUnit: "month" }),
    ).toEqual({ intervalValue: 3, intervalUnit: "month" });
  });

  it("rejects an empty body", () => {
    const result = UpdateMaintenanceTaskBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual([]);
  });

  it.each([
    { title: "" },
    { title: "t".repeat(101) },
    { intervalValue: 0 },
    { intervalValue: 1.5 },
    { intervalUnit: "fortnight" },
  ])("rejects invalid body %#", (body) => {
    expect(UpdateMaintenanceTaskBodySchema.safeParse(body).success).toBe(false);
  });

  it("ignores unknown keys such as lastCompletedDate and nextDue", () => {
    expect(
      UpdateMaintenanceTaskBodySchema.parse({
        title: "Replace filter",
        lastCompletedDate: "2026-06-01",
        nextDue: "2026-09-01",
      }),
    ).toEqual({ title: "Replace filter" });
  });
});

describe("RescheduleMaintenanceTaskBodySchema", () => {
  it("accepts a valid future date-only nextDue", () => {
    expect(RescheduleMaintenanceTaskBodySchema.parse({ nextDue: "2026-09-15" })).toEqual({
      nextDue: "2026-09-15",
    });
  });

  it("rejects an empty body", () => {
    expect(RescheduleMaintenanceTaskBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects a missing nextDue", () => {
    expect(RescheduleMaintenanceTaskBodySchema.safeParse({}).success).toBe(false);
  });

  it.each([
    { nextDue: "2026-13-45" }, // malformed calendar date
    { nextDue: "2026-06-09T00:00:00Z" }, // not date-only
    { nextDue: "not-a-date" },
    { nextDue: 42 },
    { nextDue: null },
  ])("rejects a non-date-only or non-string nextDue %#", (body) => {
    expect(RescheduleMaintenanceTaskBodySchema.safeParse(body).success).toBe(false);
  });

  it("rejects unknown keys instead of stripping them", () => {
    const result = RescheduleMaintenanceTaskBodySchema.safeParse({
      nextDue: "2026-09-15",
      lastCompletedDate: "2026-06-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body that only carries lastCompletedDate or nextDue look-alikes", () => {
    expect(
      RescheduleMaintenanceTaskBodySchema.safeParse({ lastCompletedDate: "2026-06-01" }).success,
    ).toBe(false);
    expect(
      RescheduleMaintenanceTaskBodySchema.safeParse({ nextDue: "2026-09-15", extra: 1 }).success,
    ).toBe(false);
  });
});
