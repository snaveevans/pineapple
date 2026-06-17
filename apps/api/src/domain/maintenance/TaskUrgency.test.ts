import { describe, expect, it } from "vitest";
import { addCalendarDays, calendarDaysBetween } from "./DateOnly.ts";
import { compareTaskUrgency, deriveTaskStatus, mostUrgentTaskStatus } from "./TaskUrgency.ts";

describe("deriveTaskStatus", () => {
  const today = "2026-06-16";

  it("returns overdue when nextDue is before todayUtc", () => {
    expect(deriveTaskStatus("2026-06-15", today)).toBe("overdue");
  });

  it("returns soon when nextDue is today", () => {
    expect(deriveTaskStatus(today, today)).toBe("soon");
  });

  it("returns soon when nextDue is within the next 7 calendar days", () => {
    expect(deriveTaskStatus(addCalendarDays(today, 7), today)).toBe("soon");
  });

  it("returns ok when nextDue is more than 7 calendar days after todayUtc", () => {
    expect(deriveTaskStatus(addCalendarDays(today, 8), today)).toBe("ok");
  });
});

describe("mostUrgentTaskStatus", () => {
  it("prefers overdue over soon and ok", () => {
    expect(mostUrgentTaskStatus(["ok", "soon", "overdue"])).toBe("overdue");
  });

  it("returns null for an empty list", () => {
    expect(mostUrgentTaskStatus([])).toBeNull();
  });
});

describe("compareTaskUrgency", () => {
  it("orders overdue before soon before ok", () => {
    expect(compareTaskUrgency("overdue", "soon")).toBeLessThan(0);
    expect(compareTaskUrgency("soon", "ok")).toBeLessThan(0);
  });
});

describe("calendarDaysBetween", () => {
  it("counts calendar days without timestamp arithmetic", () => {
    expect(calendarDaysBetween("2026-06-10", "2026-06-16")).toBe(6);
    expect(calendarDaysBetween("2026-06-16", "2026-06-10")).toBe(-6);
  });

  it("handles multi-year distances", () => {
    expect(calendarDaysBetween("2023-06-16", "2026-06-16")).toBe(1096);
  });
});
