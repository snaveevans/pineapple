import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { MaintenanceTaskCreated } from "../../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import type { IntervalUnit } from "../../../domain/maintenance/IntervalUnit.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

const INTERVAL_DAYS_APPROX: Record<IntervalUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export class MaintenanceTaskCreatedTelemetryHandler implements DomainEventHandler<MaintenanceTaskCreated> {
  readonly eventType = "MaintenanceTaskCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: MaintenanceTaskCreated): void {
    const dataPoint: TelemetryDataPoint = {
      indexes: [event.ownerId],
      blobs: [
        event.type,
        "MaintenanceTask",
        event.maintenanceTaskId,
        event.assetId,
        event.ownerId,
        event.actorId,
        "CreateMaintenanceTask",
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
