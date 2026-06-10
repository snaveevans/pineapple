import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceRecordCreated } from "../../../domain/maintenance/events/MaintenanceRecordCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapMaintenanceRecordCreatedTelemetry(
  event: MaintenanceRecordCreated,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "MaintenanceRecord",
      event.maintenanceRecordId,
      event.assetId,
      event.ownerId,
      event.actorId,
      "CreateMaintenanceRecord",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime(), dateOnlyToUtcMidnight(event.performedAt)],
  };
}

export class MaintenanceRecordCreatedTelemetryHandler implements DomainEventHandler<MaintenanceRecordCreated> {
  readonly eventType = "MaintenanceRecordCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceRecordCreated): void {
    this.sink.write(mapMaintenanceRecordCreatedTelemetry(event));
  }
}

function dateOnlyToUtcMidnight(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
