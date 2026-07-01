export function dateKey(value: string): string {
  return value.slice(0, 10);
}

export function ymdParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
}

export function ymdToUTC(value: string): number {
  const [year, month, day] = ymdParts(value);
  return Date.UTC(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = ymdParts(key);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(date.toISOString());
}

export function formatShortDate(key: string): string {
  const [year, month, day] = ymdParts(key);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthDay(key: string): string {
  const [year, month, day] = ymdParts(key);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
