import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { AssetUnsharedFromTeam } from "../../../domain/asset/events/AssetUnsharedFromTeam.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapAssetUnsharedFromTeamTelemetry(
  event: AssetUnsharedFromTeam,
): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Asset",
      event.assetId,
      event.ownerId,
      event.teamId,
      event.actorId,
      "UnshareAsset",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime()],
  };
}

export class AssetUnsharedFromTeamTelemetryHandler implements DomainEventHandler<AssetUnsharedFromTeam> {
  readonly eventType = "AssetUnsharedFromTeam" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: AssetUnsharedFromTeam): void {
    this.sink.write(mapAssetUnsharedFromTeamTelemetry(event));
  }
}
