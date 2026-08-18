import type { DomainEventHandler } from "../../../application/ports/EventBus.ts";
import type { AssetEdited } from "../../../domain/asset/events/AssetEdited.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";

// Records ids and boolean change-flags only — never the name or metadata values
// (telemetry.md anti-pattern: no user-supplied strings in blobs).
export function mapAssetEditedTelemetry(event: AssetEdited): TelemetryDataPoint {
  return {
    indexes: [event.ownerId],
    blobs: [
      event.type,
      "Asset",
      event.assetId,
      event.ownerId,
      event.actorId,
      "EditAsset",
      "v1",
      "success",
    ],
    doubles: [
      1,
      event.occurredAt.getTime(),
      event.nameChanged ? 1 : 0,
      event.metadataChanged ? 1 : 0,
    ],
  };
}

export class AssetEditedTelemetryHandler implements DomainEventHandler<AssetEdited> {
  readonly eventType = "AssetEdited" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: AssetEdited): void {
    this.sink.write(mapAssetEditedTelemetry(event));
  }
}
