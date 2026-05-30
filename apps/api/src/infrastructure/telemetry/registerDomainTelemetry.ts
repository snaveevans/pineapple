import type { EventBus } from "../../application/ports/EventBus.ts";
import { AnalyticsEngineTelemetrySink } from "./AnalyticsEngineTelemetrySink.ts";
import { AssetCreatedTelemetryHandler } from "./asset/AssetCreatedTelemetryHandler.ts";

export function registerDomainTelemetry(deps: {
  eventBus: EventBus;
  assetDomainDataset: AnalyticsEngineDataset | undefined;
}): void {
  if (!deps.assetDomainDataset) return;
  const assetDomainSink = new AnalyticsEngineTelemetrySink(deps.assetDomainDataset);
  deps.eventBus.subscribe(new AssetCreatedTelemetryHandler(assetDomainSink));
}
