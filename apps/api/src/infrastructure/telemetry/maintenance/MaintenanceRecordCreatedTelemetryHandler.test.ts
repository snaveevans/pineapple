import { describe, expect, it } from "vitest";
import { AssetId, MaintenanceRecordId, UserId } from "@snaveevans/pineapple-shared";
import type { MaintenanceRecordCreated } from "../../../domain/maintenance/events/MaintenanceRecordCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  MaintenanceRecordCreatedTelemetryHandler,
  mapMaintenanceRecordCreatedTelemetry,
} from "./MaintenanceRecordCreatedTelemetryHandler.ts";

describe("MaintenanceRecordCreatedTelemetryHandler", () => {
  const event: MaintenanceRecordCreated = {
    type: "MaintenanceRecordCreated",
    maintenanceRecordId: MaintenanceRecordId.from("e914b960-772f-46a7-b6fb-f333dcfc7fc9"),
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("71afbc20-f2e0-4fc8-a989-278437cf792c"),
    performedAt: "2026-06-09",
    occurredAt: new Date("2026-06-09T12:00:00.000Z"),
  };

  it("maps the event to the documented Analytics Engine field order", () => {
    expect(mapMaintenanceRecordCreatedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "MaintenanceRecordCreated",
        "MaintenanceRecord",
        event.maintenanceRecordId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "CreateMaintenanceRecord",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), Date.UTC(2026, 5, 9)],
    });
  });

  it("writes the mapped data point to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new MaintenanceRecordCreatedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapMaintenanceRecordCreatedTelemetry(event)]);
  });
});
