import { describe, expect, it, vi } from "vitest";
import {
  WEB_ANALYTICS_MARKER,
  cloudflareWebAnalyticsPlugin,
  resolveWebAnalyticsBeacon,
  transformWebAnalyticsHtml,
} from "./cloudflareWebAnalyticsPlugin.ts";

const htmlWithMarker = `<head>${WEB_ANALYTICS_MARKER}</head>`;

describe("resolveWebAnalyticsBeacon", () => {
  it("returns an empty string for missing or placeholder tokens", () => {
    expect(resolveWebAnalyticsBeacon(undefined)).toBe("");
    expect(resolveWebAnalyticsBeacon("REPLACE_WITH_SITE_TOKEN")).toBe("");
  });

  it("returns the beacon script for a real token", () => {
    expect(resolveWebAnalyticsBeacon("abc123")).toContain(
      "static.cloudflareinsights.com/beacon.min.js",
    );
    expect(resolveWebAnalyticsBeacon("abc123")).toContain("abc123");
  });
});

describe("transformWebAnalyticsHtml", () => {
  it("removes the marker when no token is configured", () => {
    expect(transformWebAnalyticsHtml(htmlWithMarker, undefined)).toBe("<head></head>");
    expect(transformWebAnalyticsHtml(htmlWithMarker, "REPLACE_WITH_SITE_TOKEN")).toBe(
      "<head></head>",
    );
  });

  it("injects the beacon and removes the marker when a token is configured", () => {
    const result = transformWebAnalyticsHtml(htmlWithMarker, "abc123");

    expect(result).toContain("static.cloudflareinsights.com/beacon.min.js");
    expect(result).toContain("abc123");
    expect(result).not.toContain(WEB_ANALYTICS_MARKER);
  });

  it("warns and leaves html unchanged when the marker is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = "<head></head>";

    expect(transformWebAnalyticsHtml(html, "abc123")).toBe(html);
    expect(warn).toHaveBeenCalledWith(
      `[cloudflare-web-analytics] ${WEB_ANALYTICS_MARKER} not found in index.html — beacon will not be injected`,
    );

    warn.mockRestore();
  });
});

describe("cloudflareWebAnalyticsPlugin", () => {
  it("wires transformIndexHtml to the shared html transformer", () => {
    const plugin = cloudflareWebAnalyticsPlugin();
    const transform = plugin.transformIndexHtml;
    if (typeof transform !== "function") {
      throw new Error("transformIndexHtml hook missing");
    }

    const result = transform(htmlWithMarker, { path: "/index.html", filename: "index.html" });

    expect(result).toContain("static.cloudflareinsights.com/beacon.min.js");
    expect(result).not.toContain(WEB_ANALYTICS_MARKER);
  });
});
