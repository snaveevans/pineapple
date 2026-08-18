import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceTaskUpdated } from "../../../domain/maintenance/events/MaintenanceTaskUpdated.ts";
import type { IntervalUnit } from "../../../domain/maintenance/IntervalUnit.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

const INTERVAL_DAYS_APPROX: Record<IntervalUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export class MaintenanceTaskUpdatedTelemetryHandler implements DomainEventHandler<MaintenanceTaskUpdated> {
  readonly eventType = "MaintenanceTaskUpdated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceTaskUpdated): void {
    const dataPoint: TelemetryDataPoint = {
      indexes: [event.ownerId],
      blobs: [
        event.type,
        "MaintenanceTask",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "UpdateMaintenanceTask",
        "v1",
        "success",
      ],
      doubles: [
        1,
        event.occurredAt.getTime(),
        event.intervalValue * INTERVAL_DAYS_APPROX[event.intervalUnit],
      ],
    };
    this.sink.write(dataPoint);
  }
}
