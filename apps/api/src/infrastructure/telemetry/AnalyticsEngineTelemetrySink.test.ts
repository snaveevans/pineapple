import { describe, expect, it, vi } from "vitest";
import { AnalyticsEngineTelemetrySink } from "./AnalyticsEngineTelemetrySink.ts";

describe("AnalyticsEngineTelemetrySink", () => {
  it("contains dataset failures without logging private exception text", () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error("867 Secret Lane private payload");
    });
    const sink = new AnalyticsEngineTelemetrySink({
      writeDataPoint,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() =>
        sink.write({ indexes: ["request"], blobs: ["Mcp"], doubles: [1] }),
      ).not.toThrow();
      expect(errorLog).toHaveBeenCalledExactlyOnceWith("Analytics Engine telemetry write failed");
      expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
        indexes: ["request"],
        blobs: ["Mcp"],
        doubles: [1],
      });
    } finally {
      errorLog.mockRestore();
    }
  });
});
