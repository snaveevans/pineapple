import { describe, expect, it } from "vitest";
import { UpdateMaintenanceTaskBodySchema } from "./maintenanceTaskSchemas.ts";

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
