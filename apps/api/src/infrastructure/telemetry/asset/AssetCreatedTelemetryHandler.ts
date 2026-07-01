import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { AssetCreated } from "../../../domain/asset/events/AssetCreated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

export function mapAssetCreatedTelemetry(event: AssetCreated): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Asset",
      event.assetId,
      event.ownerId,
      event.assetType,
      event.actorId,
      "CreateAsset",
      "v1",
      "success",
    ],
    doubles: [1, event.occurredAt.getTime(), event.assetModelYear ?? 0],
  };
}

export class AssetCreatedTelemetryHandler implements DomainEventHandler<AssetCreated> {
  readonly eventType = "AssetCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: AssetCreated): void {
    this.sink.write(mapAssetCreatedTelemetry(event));
  }
}
