import { describe, expect, it } from "vitest";
import {
  getAllowedApiCorsOrigin,
  getTrustedDevWebOrigins,
  resolveDevAuthEmail,
} from "./authSecurity.ts";

describe("auth security policy", () => {
  it("allows the configured auth origin and loopback development web origins", () => {
    expect(
      getAllowedApiCorsOrigin(
        "http://localhost:5173",
        "http://localhost:8787",
        "http://localhost:5173",
      ),
    ).toBe("http://localhost:5173");
    expect(
      getAllowedApiCorsOrigin("https://pineapple.tylerevans.co", "https://pineapple.tylerevans.co"),
    ).toBe("https://pineapple.tylerevans.co");
  });

  it("rejects arbitrary and non-loopback development origins", () => {
    expect(
      getAllowedApiCorsOrigin(
        "https://evil.example",
        "https://pineapple.tylerevans.co",
        "https://evil.example",
      ),
    ).toBeUndefined();
    expect(getTrustedDevWebOrigins("http://localhost:8787", "https://evil.example")).toEqual([]);
  });

  it("requires an explicit loopback-only opt-in for the authentication bypass", () => {
    expect(
      resolveDevAuthEmail({
        baseURL: "http://localhost:8787",
        email: "dev@example.com",
        enabled: "true",
      }),
    ).toBe("dev@example.com");
    expect(() =>
      resolveDevAuthEmail({
        baseURL: "https://pineapple.tylerevans.co",
        email: "dev@example.com",
        enabled: "true",
      }),
    ).toThrow("Invalid local authentication bypass configuration");
    expect(() =>
      resolveDevAuthEmail({
        baseURL: "http://localhost:8787",
        email: "dev@example.com",
        enabled: undefined,
      }),
    ).toThrow("Invalid local authentication bypass configuration");
  });
});
