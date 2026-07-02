import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { ReminderEmailDispatched } from "../../../domain/notification/events/ReminderEmailDispatched.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapReminderEmailDispatchedTelemetry(
  event: ReminderEmailDispatched,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Notification",
      event.emailBatchId,
      event.ownerId,
      "v1",
      event.result,
      event.suppressReason,
    ],
    doubles: [1, event.occurredAt.getTime(), event.notificationCount],
  };
}

export class ReminderEmailDispatchedTelemetryHandler
  implements DomainEventHandler<ReminderEmailDispatched>
{
  readonly eventType = "ReminderEmailDispatched" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: ReminderEmailDispatched): void {
    this.sink.write(mapReminderEmailDispatchedTelemetry(event));
  }
}
