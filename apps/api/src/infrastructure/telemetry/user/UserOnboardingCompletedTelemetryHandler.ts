import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { UserOnboardingCompleted } from "../../../domain/identity/events/UserOnboardingCompleted.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapUserOnboardingCompletedTelemetry(
  event: UserOnboardingCompleted,
): TelemetryDataPoint {
  return {
    indexes: [event.userId],
    blobs: [event.type, "User", event.userId, "v1", "success", "UpdateUserProfile"],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class UserOnboardingCompletedTelemetryHandler implements DomainEventHandler<UserOnboardingCompleted> {
  readonly eventType = "UserOnboardingCompleted" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: UserOnboardingCompleted): void {
    this.sink.write(mapUserOnboardingCompletedTelemetry(event));
  }
}
