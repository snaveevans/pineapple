import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceTaskDeleted } from "../../../domain/maintenance/events/MaintenanceTaskDeleted.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export class MaintenanceTaskDeletedTelemetryHandler implements DomainEventHandler<MaintenanceTaskDeleted> {
  readonly eventType = "MaintenanceTaskDeleted" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceTaskDeleted): void {
    const dataPoint: TelemetryDataPoint = {
      indexes: [event.ownerId],
      blobs: [
        event.type,
        "MaintenanceTask",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "DeleteMaintenanceTask",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime()],
    };
    this.sink.write(dataPoint);
  }
}
