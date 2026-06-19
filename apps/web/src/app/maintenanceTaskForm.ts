import type { CreateMaintenanceTaskBody, IntervalUnit } from "../api/maintenanceTasks.ts";

export const TASK_TITLE_MAX = 100;

export const TASK_UNITS: ReadonlyArray<{ value: IntervalUnit; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export type MaintenanceTaskFormValues = {
  title: string;
  intervalValue: string;
  intervalUnit: IntervalUnit;
  lastCompletedDate: string;
};

export type MaintenanceTaskFormErrors = Partial<
  Record<"title" | "intervalValue" | "lastCompletedDate", string>
>;

export const EMPTY_MAINTENANCE_TASK_FORM: MaintenanceTaskFormValues = {
  title: "",
  intervalValue: "3",
  intervalUnit: "month",
  lastCompletedDate: "",
};

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
}

export function ymdToUTC(value: string): number {
  const [year, month, day] = ymdParts(value);
  return Date.UTC(year, month - 1, day);
}

export function addIntervalDate(dateStr: string, value: number, unit: IntervalUnit): string {
  const [year, month, day] = ymdParts(dateStr);
  let yy = year;
  let mm = month;
  let dd = day;

  if (unit === "day" || unit === "week") {
    const mult = unit === "week" ? 7 : 1;
    const ms = ymdToUTC(dateStr) + value * mult * 86_400_000;
    const dt = new Date(ms);
    return [
      dt.getUTCFullYear(),
      String(dt.getUTCMonth() + 1).padStart(2, "0"),
      String(dt.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  if (unit === "month") {
    mm += value;
    while (mm > 12) {
      mm -= 12;
      yy += 1;
    }
  } else {
    yy += value;
  }

  const cap = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  dd = Math.min(dd, cap);
  return [yy, String(mm).padStart(2, "0"), String(dd).padStart(2, "0")].join("-");
}

export function previewNextDueDate(
  values: Pick<MaintenanceTaskFormValues, "intervalValue" | "intervalUnit" | "lastCompletedDate">,
  todayUtc = todayDateOnly(),
): string | null {
  const intervalValue = Number(values.intervalValue);
  if (
    !values.intervalValue ||
    Number.isNaN(intervalValue) ||
    intervalValue < 1 ||
    !Number.isInteger(intervalValue) ||
    values.intervalValue.includes(".")
  ) {
    return null;
  }

  const baseline = values.lastCompletedDate || todayUtc;
  return addIntervalDate(baseline, intervalValue, values.intervalUnit);
}

export function formatPreviewDueDate(dateStr: string): string {
  const [year, month, day] = ymdParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatIntervalPhrase(intervalValue: number, intervalUnit: IntervalUnit): string {
  if (intervalValue === 1) {
    return `Every ${intervalUnit}`;
  }
  return `Every ${intervalValue} ${intervalUnit}s`;
}

export function resolveAssetId(
  assets: ReadonlyArray<{ id: string }>,
  preferredId?: string | null,
): string {
  if (preferredId && assets.some((asset) => asset.id === preferredId)) {
    return preferredId;
  }
  return assets[0]?.id ?? "";
}

export function validateMaintenanceTaskForm(
  values: MaintenanceTaskFormValues,
  todayUtc = todayDateOnly(),
): MaintenanceTaskFormErrors {
  const errors: MaintenanceTaskFormErrors = {};
  const title = values.title.trim();

  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > TASK_TITLE_MAX) {
    errors.title = `Title must be ${TASK_TITLE_MAX} characters or fewer.`;
  }

  const intervalValue = Number(values.intervalValue);
  if (
    !values.intervalValue ||
    Number.isNaN(intervalValue) ||
    intervalValue < 1 ||
    !Number.isInteger(intervalValue) ||
    values.intervalValue.includes(".")
  ) {
    errors.intervalValue = "Must be a positive whole number.";
  }

  if (values.lastCompletedDate && values.lastCompletedDate > todayUtc) {
    errors.lastCompletedDate = "Must be today or earlier.";
  }

  return errors;
}

export function toCreateMaintenanceTaskBody(
  values: MaintenanceTaskFormValues,
): CreateMaintenanceTaskBody {
  const intervalValue = Number(values.intervalValue);
  return {
    title: values.title.trim(),
    intervalValue,
    intervalUnit: values.intervalUnit,
    ...(values.lastCompletedDate ? { lastCompletedDate: values.lastCompletedDate } : {}),
  };
}
