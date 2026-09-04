import {
  AssetId,
  MaintenanceTaskId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { MaintenanceReminderSnoozed } from "../../../domain/notification/events/MaintenanceReminderSnoozed.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  MaintenanceReminderSnoozedTelemetryHandler,
  mapMaintenanceReminderSnoozedTelemetry,
} from "./MaintenanceReminderSnoozedTelemetryHandler.ts";

describe("MaintenanceReminderSnoozedTelemetryHandler", () => {
  const event: MaintenanceReminderSnoozed = {
    id: DomainEventId.generate(),
    type: "MaintenanceReminderSnoozed",
    maintenanceTaskId: MaintenanceTaskId.from("b167a794-4469-4765-b540-44f6b11ec676"),
    scheduledReminderId: ScheduledReminderId.from("2f5c9a3e-1b7d-4a2e-9c8f-3d6e5b4a7c1d"),
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("9a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d"),
    snoozedUntil: "2026-09-04",
    occurredAt: new Date("2026-09-03T12:00:00.000Z"),
  };

  it("maps the event to the documented Analytics Engine field order without PII", () => {
    expect(mapMaintenanceReminderSnoozedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "MaintenanceReminderSnoozed",
        "Notification",
        event.maintenanceTaskId,
        event.scheduledReminderId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "2026-09-04",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime()],
    });
  });

  it("writes the mapped data point to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new MaintenanceReminderSnoozedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapMaintenanceReminderSnoozedTelemetry(event)]);
  });
});
