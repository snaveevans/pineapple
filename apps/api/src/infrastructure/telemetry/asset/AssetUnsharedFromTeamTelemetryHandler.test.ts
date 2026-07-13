import { describe, expect, it, vi } from "vitest";
import { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { AssetUnsharedFromTeam } from "../../../domain/asset/events/AssetUnsharedFromTeam.ts";
import {
  AssetUnsharedFromTeamTelemetryHandler,
  mapAssetUnsharedFromTeamTelemetry,
} from "./AssetUnsharedFromTeamTelemetryHandler.ts";

describe("AssetUnsharedFromTeamTelemetryHandler", () => {
  it("maps ids and roles without PII names", () => {
    const event = AssetUnsharedFromTeam({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Secret Truck Name",
      teamId: TeamId.generate(),
      teamName: "Secret Team Name",
    });

    const point = mapAssetUnsharedFromTeamTelemetry(event);

    expect(point.indexes).toEqual([event.ownerId]);
    expect(point.blobs).toEqual([
      "AssetUnsharedFromTeam",
      "Asset",
      event.assetId,
      event.ownerId,
      event.teamId,
      event.actorId,
      "UnshareAsset",
      "v1",
      "success",
    ]);
    expect(point.blobs.join(" ")).not.toContain("Secret");
  });

  it("writes through the sink", () => {
    const write = vi.fn();
    const handler = new AssetUnsharedFromTeamTelemetryHandler({ write });
    const event = AssetUnsharedFromTeam({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Truck",
      teamId: TeamId.generate(),
      teamName: "Ops",
    });

    handler.handle(event);

    expect(write).toHaveBeenCalledOnce();
  });
});
