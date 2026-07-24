import { describe, expect, it } from "vitest";
import { ValidationError } from "@snaveevans/pineapple-shared";
import { isValidDateOnly, validateDateOnly } from "./DateOnly.ts";

describe("isValidDateOnly", () => {
  it("accepts well-formed calendar dates including boundaries", () => {
    expect(isValidDateOnly("0001-01-01")).toBe(true);
    expect(isValidDateOnly("2026-01-01")).toBe(true);
    expect(isValidDateOnly("2026-12-31")).toBe(true);
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2026-02-28")).toBe(true);
  });

  it("rejects bad format", () => {
    expect(isValidDateOnly("")).toBe(false);
    expect(isValidDateOnly("not-a-date")).toBe(false);
    expect(isValidDateOnly("2026/01/01")).toBe(false);
    expect(isValidDateOnly("2026-1-01")).toBe(false);
    expect(isValidDateOnly("2026-01-1")).toBe(false);
    expect(isValidDateOnly("26-01-01")).toBe(false);
    expect(isValidDateOnly("2026-01-01T00:00:00Z")).toBe(false);
  });

  it("rejects year 0", () => {
    expect(isValidDateOnly("0000-01-01")).toBe(false);
  });

  it("rejects month 0 and month 13", () => {
    expect(isValidDateOnly("2026-00-15")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
  });

  it("rejects day 0 and days past month end", () => {
    expect(isValidDateOnly("2026-01-00")).toBe(false);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-04-31")).toBe(false);
    expect(isValidDateOnly("2026-01-32")).toBe(false);
  });
});

describe("validateDateOnly", () => {
  it("accepts a valid date without throwing", () => {
    expect(() => validateDateOnly("2026-06-11")).not.toThrow();
  });

  it("throws ValidationError with field for bad format", () => {
    expect(() => validateDateOnly("nope", "lastCompletedDate")).toThrow(ValidationError);
    try {
      validateDateOnly("nope", "lastCompletedDate");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("lastCompletedDate");
    }
  });

  it("throws ValidationError with default field for invalid calendar date", () => {
    expect(() => validateDateOnly("2026-02-30")).toThrow(ValidationError);
    try {
      validateDateOnly("2026-02-30");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("performedAt");
    }
  });
});
