import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { UserProvisioned } from "../../../domain/identity/events/UserProvisioned.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapUserProvisionedTelemetry(event: UserProvisioned): TelemetryDataPoint {
  return {
    indexes: [event.userId],
    blobs: [event.type, "User", event.userId, "v1", "success", "ProvisionUser"],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class UserProvisionedTelemetryHandler implements DomainEventHandler<UserProvisioned> {
  readonly eventType = "UserProvisioned" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: UserProvisioned): void {
    this.sink.write(mapUserProvisionedTelemetry(event));
  }
}
