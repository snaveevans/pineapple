import { describe, expect, it } from "vitest";
import { parseWranglerJsonc } from "./parseWranglerJsonc.ts";

describe("parseWranglerJsonc", () => {
  it("strips full-line and trailing inline comments", () => {
    const config = parseWranglerJsonc(`{
      // account config
      "vars": {
        "CF_WEB_ANALYTICS_TOKEN": "abc123" // staging token
      },
    }`);

    expect(config.vars?.CF_WEB_ANALYTICS_TOKEN).toBe("abc123");
  });

  it("preserves commas inside quoted string values", () => {
    const config = parseWranglerJsonc(`{
      "vars": {
        "SOME_KEY": "items, ]"
      }
    }`);

    expect(config.vars?.SOME_KEY).toBe("items, ]");
  });
});
