import { describe, expect, it } from "vitest";
import type { DashboardQueueItem } from "../api/dashboard.ts";
import {
  formatDueLabel,
  formatFleetSubline,
  formatRecurrence,
  toQueuePresentation,
} from "./dashboardPresentation.ts";

describe("dashboardPresentation", () => {
  const todayUtc = "2026-06-16";

  const baseItem: DashboardQueueItem = {
    taskId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    taskTitle: "Oil change",
    nextDue: "2026-06-20",
    status: "soon",
    daysDue: 4,
    intervalValue: 3,
    intervalUnit: "month",
    lastCompletedDate: "2026-03-14",
    createdAt: "2026-01-15T12:00:00.000Z",
    assetId: "195d0ef0-47f5-439f-abfd-29f892c9a040",
    assetName: "Work Truck",
    assetType: "vehicle",
    sharing: { scope: "personal", isOwner: true },
  };

  it("formats overdue, today, tomorrow, and future due labels from daysDue", () => {
    expect(formatDueLabel(-3)).toBe("Overdue · 3 days");
    expect(formatDueLabel(0)).toBe("Today");
    expect(formatDueLabel(1)).toBe("Tomorrow");
    expect(formatDueLabel(5)).toBe("In 5 days");
  });

  it("formats fleet subline from API totals and todayUtc", () => {
    expect(formatFleetSubline(todayUtc, 6)).toBe(
      "Tuesday · June 16, 2026 · 6 assets in your fleet",
    );
  });

  it("formats recurrence labels", () => {
    expect(formatRecurrence(1, "year")).toBe("Annual");
    expect(formatRecurrence(2, "month")).toBe("Every 2 months");
  });

  it("maps API sharing onto queue presentation badges", () => {
    expect(toQueuePresentation(baseItem).sharingBadge).toBeNull();
    expect(
      toQueuePresentation({
        ...baseItem,
        sharing: { scope: "team", isOwner: true },
      }).sharingBadge,
    ).toEqual({ kind: "shared-with-team", text: "Shared with team" });
    expect(
      toQueuePresentation({
        ...baseItem,
        sharing: { scope: "team", isOwner: false, ownerDisplayName: "Pat" },
      }).sharingBadge,
    ).toEqual({ kind: "shared-by", text: "Shared by Pat" });
  });
});
