import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "../api/activity.ts";
import { groupActivityEntries, toActivityPresentation } from "./activityPresentation.ts";

const baseEntry: ActivityEntry = {
  id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
  type: "maintenance_logged",
  occurredAt: "2026-06-09T18:25:24.887Z",
  asset: {
    id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
    name: "My Truck",
    type: "vehicle",
  },
  title: "Changed oil",
  performedAt: "2026-06-08",
};

describe("activityPresentation", () => {
  it("uses API fields to format a maintenance entry without deriving business state", () => {
    expect(toActivityPresentation(baseEntry, new Date("2026-06-09T19:25:24.887Z"))).toMatchObject({
      actionLabel: "Maintenance logged",
      headline: "Changed oil",
      detail: "My Truck · Vehicle · Performed Jun 8, 2026",
      icon: "wrench",
      timeLabel: "1h ago",
    });
  });

  it("groups entries by occurredAt calendar day", () => {
    const groups = groupActivityEntries(
      [
        baseEntry,
        {
          ...baseEntry,
          id: "41280819-dc19-4b59-9d1c-d67d0c206e4f",
          type: "task_completed",
          occurredAt: "2026-06-08T22:00:00.000Z",
        },
      ],
      new Date("2026-06-09T23:00:00.000Z"),
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0]?.entries).toHaveLength(1);
    expect(groups[1]?.entries[0]?.actionLabel).toBe("Task completed");
  });
});
