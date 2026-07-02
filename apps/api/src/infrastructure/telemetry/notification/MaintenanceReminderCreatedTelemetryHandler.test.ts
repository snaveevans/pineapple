import { AssetId, MaintenanceTaskId, NotificationId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { MaintenanceReminderCreated } from "../../../domain/notification/events/MaintenanceReminderCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  MaintenanceReminderCreatedTelemetryHandler,
  mapMaintenanceReminderCreatedTelemetry,
} from "./MaintenanceReminderCreatedTelemetryHandler.ts";

describe("MaintenanceReminderCreatedTelemetryHandler", () => {
  const event: MaintenanceReminderCreated = {
    id: DomainEventId.generate(),
    type: "MaintenanceReminderCreated",
    notificationId: NotificationId.from("fb5a4758-4371-45df-a1f6-595c9ea4f14d"),
    notificationType: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.from("b167a794-4469-4765-b540-44f6b11ec676"),
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: "system",
    leadDays: 7,
    occurredAt: new Date("2026-07-02T12:00:00.000Z"),
  };

  it("maps the event to the documented Analytics Engine field order without PII", () => {
    expect(mapMaintenanceReminderCreatedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "MaintenanceReminderCreated",
        "Notification",
        event.notificationId,
        "maintenance_due_soon",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        "system",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), 7],
    });
  });

  it("writes the mapped data point to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new MaintenanceReminderCreatedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapMaintenanceReminderCreatedTelemetry(event)]);
  });
});
