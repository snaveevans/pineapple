import { describe, expect, it } from "vitest";
import {
  addIntervalDate,
  formatIntervalPhrase,
  previewNextDueDate,
  resolveAssetId,
  toCreateMaintenanceTaskBody,
  validateMaintenanceTaskForm,
} from "./maintenanceTaskForm.ts";

describe("validateMaintenanceTaskForm", () => {
  it("requires a title", () => {
    expect(
      validateMaintenanceTaskForm(
        {
          title: "  ",
          intervalValue: "3",
          intervalUnit: "month",
          lastCompletedDate: "",
        },
        "2026-06-18",
      ),
    ).toEqual({ title: "Title is required." });
  });

  it("rejects non-integer interval values", () => {
    expect(
      validateMaintenanceTaskForm(
        {
          title: "Oil change",
          intervalValue: "1.5",
          intervalUnit: "month",
          lastCompletedDate: "",
        },
        "2026-06-18",
      ),
    ).toEqual({ intervalValue: "Must be a positive whole number." });
  });

  it("rejects future last-completed dates", () => {
    expect(
      validateMaintenanceTaskForm(
        {
          title: "Oil change",
          intervalValue: "3",
          intervalUnit: "month",
          lastCompletedDate: "2026-06-19",
        },
        "2026-06-18",
      ),
    ).toEqual({ lastCompletedDate: "Must be today or earlier." });
  });
});

describe("previewNextDueDate", () => {
  it("starts from today when last completed is blank", () => {
    expect(
      previewNextDueDate(
        {
          intervalValue: "3",
          intervalUnit: "month",
          lastCompletedDate: "",
        },
        "2026-06-18",
      ),
    ).toBe("2026-09-18");
  });

  it("starts from last completed when provided", () => {
    expect(
      previewNextDueDate(
        {
          intervalValue: "2",
          intervalUnit: "week",
          lastCompletedDate: "2026-06-01",
        },
        "2026-06-18",
      ),
    ).toBe("2026-06-15");
  });
});

describe("addIntervalDate", () => {
  it("caps month-end overflow", () => {
    expect(addIntervalDate("2026-01-31", 1, "month")).toBe("2026-02-28");
  });
});

describe("toCreateMaintenanceTaskBody", () => {
  it("omits lastCompletedDate when blank", () => {
    expect(
      toCreateMaintenanceTaskBody({
        title: "  Filter change  ",
        intervalValue: "6",
        intervalUnit: "month",
        lastCompletedDate: "",
      }),
    ).toEqual({
      title: "Filter change",
      intervalValue: 6,
      intervalUnit: "month",
    });
  });
});

describe("formatIntervalPhrase", () => {
  it("matches maintenance task card phrasing", () => {
    expect(formatIntervalPhrase(3, "month")).toBe("Every 3 months");
    expect(formatIntervalPhrase(1, "year")).toBe("Every year");
  });
});

describe("resolveAssetId", () => {
  const assets = [{ id: "a" }, { id: "b" }];

  it("uses a valid preferred id", () => {
    expect(resolveAssetId(assets, "b")).toBe("b");
  });

  it("falls back to the first asset when preferred id is missing", () => {
    expect(resolveAssetId(assets, "missing")).toBe("a");
  });

  it("treats empty string as absent", () => {
    expect(resolveAssetId(assets, "")).toBe("a");
  });
});
