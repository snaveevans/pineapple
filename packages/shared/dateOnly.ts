/** Pure YYYY-MM-DD calendar arithmetic — no timestamps, no business rules. */

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function formatDateOnly(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Adds calendar days to a YYYY-MM-DD value without timestamp arithmetic. */
export function addCalendarDays(date: string, days: number): string {
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7));
  let day = Number(date.slice(8, 10)) + days;

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  while (day < 1) {
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
    day += daysInMonth(year, month);
  }

  return formatDateOnly(year, month, day);
}

/** Returns the signed day distance from `start` to `end` using calendar-day steps. */
export function calendarDaysBetween(start: string, end: string): number {
  if (start === end) return 0;

  let cursor = start;
  let days = 0;
  const step = start < end ? 1 : -1;

  while (cursor !== end) {
    cursor = addCalendarDays(cursor, step);
    days += step;
  }

  return days;
}
