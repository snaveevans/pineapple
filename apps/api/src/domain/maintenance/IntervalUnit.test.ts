import { describe, expect, it } from "vitest";
import { INTERVAL_UNITS, addInterval } from "./IntervalUnit.ts";

describe("INTERVAL_UNITS", () => {
  it("lists day, week, month, and year", () => {
    expect(INTERVAL_UNITS).toEqual(["day", "week", "month", "year"]);
  });
});

describe("addInterval", () => {
  describe("day", () => {
    it("advances forward by the given number of days", () => {
      expect(addInterval("2026-01-15", 1, "day")).toBe("2026-01-16");
      expect(addInterval("2026-01-15", 30, "day")).toBe("2026-02-14");
    });

    it("keeps the last day of the month when day equals month length", () => {
      // kills while (d >= daysInMonth) — Jan 31 must stay Jan 31, not roll to Feb
      expect(addInterval("2026-01-15", 16, "day")).toBe("2026-01-31");
      expect(addInterval("2026-01-31", 0, "day")).toBe("2026-01-31");
    });

    it("rolls across month and year boundaries", () => {
      expect(addInterval("2026-01-31", 1, "day")).toBe("2026-02-01");
      expect(addInterval("2026-12-31", 1, "day")).toBe("2027-01-01");
    });
  });

  describe("week", () => {
    it("advances forward by weeks (7-day multiples)", () => {
      expect(addInterval("2026-01-15", 1, "week")).toBe("2026-01-22");
      expect(addInterval("2026-01-15", 2, "week")).toBe("2026-01-29");
    });
  });

  describe("month", () => {
    it("advances forward by months", () => {
      expect(addInterval("2026-01-15", 1, "month")).toBe("2026-02-15");
      expect(addInterval("2026-01-15", 2, "month")).toBe("2026-03-15");
    });

    it("clamps end-of-month when target month is shorter (Jan 31 + 1 month)", () => {
      expect(addInterval("2026-01-31", 1, "month")).toBe("2026-02-28");
    });

    it("clamps to Feb 29 in a leap year", () => {
      expect(addInterval("2024-01-31", 1, "month")).toBe("2024-02-29");
    });

    it("rolls year forward when month overflows (Dec + 1 month)", () => {
      expect(addInterval("2026-12-15", 1, "month")).toBe("2027-01-15");
      expect(addInterval("2026-11-30", 2, "month")).toBe("2027-01-30");
      expect(addInterval("2026-12-31", 1, "month")).toBe("2027-01-31");
    });
  });

  describe("year", () => {
    it("advances forward by years", () => {
      expect(addInterval("2026-06-11", 1, "year")).toBe("2027-06-11");
      expect(addInterval("2026-06-11", 3, "year")).toBe("2029-06-11");
    });

    it("clamps leap-day Feb 29 to Feb 28 in a non-leap year", () => {
      expect(addInterval("2024-02-29", 1, "year")).toBe("2025-02-28");
    });

    it("keeps Feb 29 when the target year is also a leap year", () => {
      expect(addInterval("2024-02-29", 4, "year")).toBe("2028-02-29");
    });
  });
});
