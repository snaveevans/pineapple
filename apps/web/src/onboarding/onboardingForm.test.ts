import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX_LENGTH,
  NAME_TOO_LONG_MESSAGE,
  toProfileFormError,
  validateDisplayName,
} from "./onboardingForm";

describe("validateDisplayName", () => {
  it("accepts a trimmed name within the limit", () => {
    expect(validateDisplayName("  Dale  ")).toEqual({ ok: true, value: "Dale" });
  });

  it("rejects empty or whitespace-only names", () => {
    const result = validateDisplayName("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("empty");
    }
  });

  it("rejects names longer than 100 characters after trimming", () => {
    const result = validateDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("too-long");
      expect(result.message).toBe(NAME_TOO_LONG_MESSAGE);
    }
  });
});

describe("toProfileFormError", () => {
  it("maps name validation errors from the API", () => {
    expect(toProfileFormError({ field: "name", message: NAME_TOO_LONG_MESSAGE })).toBe("too-long");
    expect(toProfileFormError({ field: "name", message: "Name is required." })).toBe("empty");
    expect(toProfileFormError({ field: "email", message: "Invalid" })).toBeNull();
  });
});
