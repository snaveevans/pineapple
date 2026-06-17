import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { UserNameUpdated } from "../../../domain/identity/events/UserNameUpdated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapUserNameUpdatedTelemetry(event: UserNameUpdated): TelemetryDataPoint {
  return {
    indexes: [event.userId],
    blobs: [event.type, "User", event.userId, "v1", "success", "UpdateUserProfile"],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class UserNameUpdatedTelemetryHandler implements DomainEventHandler<UserNameUpdated> {
  readonly eventType = "UserNameUpdated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: UserNameUpdated): void {
    this.sink.write(mapUserNameUpdatedTelemetry(event));
  }
}
