import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { TeamCreated } from "../../../domain/teams/events/TeamCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapTeamCreatedTelemetry(event: TeamCreated): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Team",
      event.teamId,
      event.ownerId,
      event.actorId,
      "CreateTeam",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class TeamCreatedTelemetryHandler implements DomainEventHandler<TeamCreated> {
  readonly eventType = "TeamCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: TeamCreated): void {
    this.sink.write(mapTeamCreatedTelemetry(event));
  }
}
