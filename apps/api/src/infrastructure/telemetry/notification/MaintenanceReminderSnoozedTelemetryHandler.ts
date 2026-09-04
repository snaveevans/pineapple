import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceReminderSnoozed } from "../../../domain/notification/events/MaintenanceReminderSnoozed.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapMaintenanceReminderSnoozedTelemetry(
  event: MaintenanceReminderSnoozed,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Notification",
      event.maintenanceTaskId,
      event.scheduledReminderId,
      event.assetId,
      event.ownerId,
      event.actorId,
      event.snoozedUntil,
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class MaintenanceReminderSnoozedTelemetryHandler implements DomainEventHandler<MaintenanceReminderSnoozed> {
  readonly eventType = "MaintenanceReminderSnoozed" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceReminderSnoozed): void {
    this.sink.write(mapMaintenanceReminderSnoozedTelemetry(event));
  }
}
