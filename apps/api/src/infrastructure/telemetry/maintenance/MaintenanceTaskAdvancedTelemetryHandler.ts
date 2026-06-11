import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceTaskAdvanced } from "../../../domain/maintenance/events/MaintenanceTaskAdvanced.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export class MaintenanceTaskAdvancedTelemetryHandler implements DomainEventHandler<MaintenanceTaskAdvanced> {
  readonly eventType = "MaintenanceTaskAdvanced" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceTaskAdvanced): void {
    const dataPoint: TelemetryDataPoint = {
      indexes: [event.ownerId],
      blobs: [
        event.type,
        "MaintenanceTask",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        event.actorId,
        event.maintenanceRecordId,
        "CreateMaintenanceRecord",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), dateOnlyToUtcMidnight(event.performedAt)],
    };
    this.sink.write(dataPoint);
  }
}

function dateOnlyToUtcMidnight(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
