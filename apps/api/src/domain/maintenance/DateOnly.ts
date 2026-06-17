import {
  ValidationError,
  addCalendarDays,
  calendarDaysBetween,
  daysInMonth,
  formatDateOnly,
  isLeapYear,
} from "@snaveevans/pineapple-shared";

export { addCalendarDays, calendarDaysBetween, daysInMonth, formatDateOnly, isLeapYear };

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function validateDateOnly(value: string, field = "performedAt"): void {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new ValidationError("Date must use YYYY-MM-DD format", field);
  }
  if (!isValidDateOnly(value)) {
    throw new ValidationError("Date must be a valid calendar date", field);
  }
}
