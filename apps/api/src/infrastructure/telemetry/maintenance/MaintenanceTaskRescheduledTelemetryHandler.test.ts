import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { MaintenanceTaskRescheduled } from "../../../domain/maintenance/events/MaintenanceTaskRescheduled.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  MaintenanceTaskRescheduledTelemetryHandler,
  mapMaintenanceTaskRescheduledTelemetry,
} from "./MaintenanceTaskRescheduledTelemetryHandler.ts";

describe("MaintenanceTaskRescheduledTelemetryHandler", () => {
  const event: MaintenanceTaskRescheduled = {
    id: DomainEventId.generate(),
    type: "MaintenanceTaskRescheduled",
    maintenanceTaskId: MaintenanceTaskId.from("e914b960-772f-46a7-b6fb-f333dcfc7fc9"),
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("71afbc20-f2e0-4fc8-a989-278437cf792c"),
    assetName: "Truck",
    assetType: "vehicle",
    title: "Changed oil",
    nextDue: "2026-09-15",
    taskRevision: 1,
    activityEntryType: "task_rescheduled",
    occurredAt: new Date("2026-06-09T12:00:00.000Z"),
  };

  it("maps the event to the documented Analytics Engine field order", () => {
    expect(mapMaintenanceTaskRescheduledTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "MaintenanceTaskRescheduled",
        "MaintenanceTask",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "RescheduleMaintenanceTask",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), Date.UTC(2026, 8, 15)],
    });
  });

  it("keeps user-entered title text out of the telemetry blob", () => {
    const dataPoint = mapMaintenanceTaskRescheduledTelemetry(event);
    expect(JSON.stringify(dataPoint)).not.toContain("Changed oil");
  });

  it("writes the mapped data point to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new MaintenanceTaskRescheduledTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapMaintenanceTaskRescheduledTelemetry(event)]);
  });
});
