import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceReminderCreated } from "../../../domain/notification/events/MaintenanceReminderCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapMaintenanceReminderCreatedTelemetry(
  event: MaintenanceReminderCreated,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Notification",
      event.notificationId,
      event.notificationType,
      event.maintenanceTaskId,
      event.assetId,
      event.ownerId,
      event.actorId,
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime(), event.leadDays],
  };
}

export class MaintenanceReminderCreatedTelemetryHandler
  implements DomainEventHandler<MaintenanceReminderCreated>
{
  readonly eventType = "MaintenanceReminderCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceReminderCreated): void {
    this.sink.write(mapMaintenanceReminderCreatedTelemetry(event));
  }
}
