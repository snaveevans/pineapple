import { describe, expect, it } from "vitest";
import { AssetId, UserId } from "@snaveevans/pineapple-shared";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import {
  AssetCreatedTelemetryHandler,
  mapAssetCreatedTelemetry,
} from "./AssetCreatedTelemetryHandler.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import type { AssetCreated } from "../../../domain/asset/events/AssetCreated.ts";

describe("AssetCreatedTelemetryHandler", () => {
  const event: AssetCreated = {
    id: DomainEventId.generate(),
    type: "AssetCreated",
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    assetName: "My Truck",
    assetType: "vehicle",
    assetModelYear: 2016,
    occurredAt: new Date("2026-05-29T12:00:00.000Z"),
  };

  it("maps AssetCreated to the documented Analytics Engine field order", () => {
    expect(mapAssetCreatedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "AssetCreated",
        "Asset",
        event.assetId,
        event.ownerId,
        "vehicle",
        event.actorId,
        "CreateAsset",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), 2016],
    });
  });

  it("writes mapped data points to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new AssetCreatedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapAssetCreatedTelemetry(event)]);
  });
});
