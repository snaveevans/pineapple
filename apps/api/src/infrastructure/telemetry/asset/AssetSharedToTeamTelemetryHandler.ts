import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { AssetSharedToTeam } from "../../../domain/asset/events/AssetSharedToTeam.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapAssetSharedToTeamTelemetry(event: AssetSharedToTeam): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Asset",
      event.assetId,
      event.ownerId,
      event.teamId,
      event.actorId,
      "ShareAsset",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class AssetSharedToTeamTelemetryHandler implements DomainEventHandler<AssetSharedToTeam> {
  readonly eventType = "AssetSharedToTeam" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: AssetSharedToTeam): void {
    this.sink.write(mapAssetSharedToTeamTelemetry(event));
  }
}
