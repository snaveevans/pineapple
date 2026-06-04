import type { EventBus } from "../../application/ports/EventBus.ts";
import { AnalyticsEngineTelemetrySink } from "./AnalyticsEngineTelemetrySink.ts";
import { AssetCreatedTelemetryHandler } from "./asset/AssetCreatedTelemetryHandler.ts";
import { UserProvisionedTelemetryHandler } from "./user/UserProvisionedTelemetryHandler.ts";

export function registerDomainTelemetry(deps: {
  eventBus: EventBus;
  assetDomainDataset: AnalyticsEngineDataset;
  userDomainDataset: AnalyticsEngineDataset;
}): void {
  const assetDomainSink = new AnalyticsEngineTelemetrySink(deps.assetDomainDataset);
  deps.eventBus.subscribe(new AssetCreatedTelemetryHandler(assetDomainSink));

  const userDomainSink = new AnalyticsEngineTelemetrySink(deps.userDomainDataset);
  deps.eventBus.subscribe(new UserProvisionedTelemetryHandler(userDomainSink));
}
