import { describe, expect, it } from "vitest";
import { formatDueLabel, formatFleetSubline, formatRecurrence } from "./dashboardPresentation.ts";

describe("dashboardPresentation", () => {
  const todayUtc = "2026-06-16";

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
});
