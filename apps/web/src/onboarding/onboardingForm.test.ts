import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from "./onboardingForm";

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
    }
  });
});
