import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  formatDueLabel,
  formatFleetSubline,
  formatRecurrence,
} from "./dashboardPresentation.ts";

describe("dashboardPresentation", () => {
  const todayUtc = "2026-06-16";

  it("formats overdue, today, tomorrow, and future due labels", () => {
    expect(formatDueLabel("2026-06-13", todayUtc)).toBe("Overdue · 3 days");
    expect(formatDueLabel(todayUtc, todayUtc)).toBe("Today");
    expect(formatDueLabel("2026-06-17", todayUtc)).toBe("Tomorrow");
    expect(formatDueLabel("2026-06-21", todayUtc)).toBe("In 5 days");
  });

  it("counts calendar days without timestamp arithmetic", () => {
    expect(calendarDaysBetween("2026-06-10", todayUtc)).toBe(6);
    expect(calendarDaysBetween(todayUtc, "2026-06-10")).toBe(-6);
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
