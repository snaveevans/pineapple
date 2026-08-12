import { describe, expect, it } from "vitest";
import { thumbIconSize } from "./hf";

describe("thumbIconSize", () => {
  it("snaps mobile row thumbs (height 84) to a 24× viewBox multiple", () => {
    // raw = round(84 * 0.36) = 30; 30/24 → 24. Scale 1 keeps truck wheels on whole pixels.
    expect(thumbIconSize(84)).toBe(24);
  });

  it("keeps grid thumbs (height 132) at 48", () => {
    expect(thumbIconSize(132)).toBe(48);
  });

  it("never returns below 24", () => {
    expect(thumbIconSize(0)).toBe(24);
    expect(thumbIconSize(20)).toBe(24);
  });
});
