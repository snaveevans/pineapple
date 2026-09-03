import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceTaskRescheduled } from "../../../domain/maintenance/events/MaintenanceTaskRescheduled.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapMaintenanceTaskRescheduledTelemetry(
  event: MaintenanceTaskRescheduled,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "MaintenanceTask",
      event.maintenanceTaskId,
      event.assetId,
      event.ownerId,
      event.actorId,
      "RescheduleMaintenanceTask",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime(), dateOnlyToUtcMidnight(event.nextDue)],
  };
}

export class MaintenanceTaskRescheduledTelemetryHandler implements DomainEventHandler<MaintenanceTaskRescheduled> {
  readonly eventType = "MaintenanceTaskRescheduled" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceTaskRescheduled): void {
    this.sink.write(mapMaintenanceTaskRescheduledTelemetry(event));
  }
}

function dateOnlyToUtcMidnight(value: string): number {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}
