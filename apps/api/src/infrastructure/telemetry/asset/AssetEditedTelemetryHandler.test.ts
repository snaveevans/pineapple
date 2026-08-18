import { describe, expect, it, vi } from "vitest";
import { AssetId, UserId } from "@snaveevans/pineapple-shared";
import { AssetEdited } from "../../../domain/asset/events/AssetEdited.ts";
import {
  AssetEditedTelemetryHandler,
  mapAssetEditedTelemetry,
} from "./AssetEditedTelemetryHandler.ts";

describe("AssetEditedTelemetryHandler", () => {
  it("maps ids and boolean change-flags without the name or metadata values", () => {
    const event = AssetEdited({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Secret Truck Name",
      previousName: "Old Secret Name",
      assetType: "vehicle",
      nameChanged: true,
      metadataChanged: false,
    });

    const point = mapAssetEditedTelemetry(event);

    expect(point.indexes).toEqual([event.ownerId]);
    expect(point.blobs).toEqual([
      "AssetEdited",
      "Asset",
      event.assetId,
      event.ownerId,
      event.actorId,
      "EditAsset",
      "v1",
      "success",
    ]);
    expect(point.blobs.join(" ")).not.toContain("Secret");
    expect(point.doubles).toEqual([1, event.occurredAt.getTime(), 1, 0]);
  });

  it("writes through the sink", () => {
    const write = vi.fn();
    const handler = new AssetEditedTelemetryHandler({ write });
    const event = AssetEdited({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Truck",
      previousName: "Truck",
      assetType: "vehicle",
      nameChanged: false,
      metadataChanged: true,
    });

    handler.handle(event);

    expect(write).toHaveBeenCalledOnce();
  });
});
