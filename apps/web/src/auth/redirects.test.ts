import { describe, expect, it } from "vitest";
import { loginPath, safeAppPath } from "./redirects";

describe("safeAppPath", () => {
  it("keeps internal app destinations", () => {
    expect(safeAppPath("/app/assets/new?from=grid#form")).toBe("/app/assets/new?from=grid#form");
  });

  it("falls back for external, protocol-relative, and non-app destinations", () => {
    expect(safeAppPath("https://evil.example/app")).toBe("/app");
    expect(safeAppPath("//evil.example/app")).toBe("/app");
    expect(safeAppPath("/app/../login")).toBe("/app");
  });

  it("encodes the sanitized destination in the login path", () => {
    expect(loginPath({ next: "//evil.example/app" })).toBe("/login?next=%2Fapp");
  });
});
