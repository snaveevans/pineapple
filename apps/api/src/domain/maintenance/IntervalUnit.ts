import { daysInMonth, formatDateOnly } from "./DateOnly.ts";

export type IntervalUnit = "day" | "week" | "month" | "year";

export const INTERVAL_UNITS: IntervalUnit[] = ["day", "week", "month", "year"];

export function addInterval(date: string, value: number, unit: IntervalUnit): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  if (unit === "day" || unit === "week") {
    return addDays(year, month, day, unit === "week" ? value * 7 : value);
  }

  if (unit === "month") {
    const rawMonth = month + value;
    const newYear = year + Math.floor((rawMonth - 1) / 12);
    const newMonth = ((rawMonth - 1) % 12) + 1;
    return formatDateOnly(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
  }

  // year
  return formatDateOnly(year + value, month, Math.min(day, daysInMonth(year + value, month)));
}

function addDays(year: number, month: number, day: number, days: number): string {
  let d = day + days;
  let m = month;
  let y = year;

  while (d > daysInMonth(y, m)) {
    d -= daysInMonth(y, m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return formatDateOnly(y, m, d);
}
