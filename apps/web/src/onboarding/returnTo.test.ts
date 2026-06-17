import { describe, expect, it } from "vitest";
import { paths, routePaths } from "../routes";
import { safeReturnTo } from "./returnTo";

const ORIGIN = "http://localhost:5173";

describe("safeReturnTo", () => {
  it("accepts same-origin app paths", () => {
    expect(safeReturnTo("/app/assets", ORIGIN)).toBe("/app/assets");
    expect(safeReturnTo("/app/assets?tab=grid", ORIGIN)).toBe("/app/assets?tab=grid");
  });

  it("rejects cross-origin and protocol-relative targets", () => {
    expect(safeReturnTo("//evil.com/app", ORIGIN)).toBe(paths.appHome);
    expect(safeReturnTo("/\\evil.com", ORIGIN)).toBe(paths.appHome);
    expect(safeReturnTo("https://evil.com/app", ORIGIN)).toBe(paths.appHome);
  });

  it("rejects onboarding and profile destinations", () => {
    expect(safeReturnTo(routePaths.onboarding, ORIGIN)).toBe(paths.appHome);
    expect(safeReturnTo(routePaths.profile, ORIGIN)).toBe(paths.appHome);
  });

  it("falls back for null and non-app paths", () => {
    expect(safeReturnTo(null, ORIGIN)).toBe(paths.appHome);
    expect(safeReturnTo("/login", ORIGIN)).toBe(paths.appHome);
  });
});
