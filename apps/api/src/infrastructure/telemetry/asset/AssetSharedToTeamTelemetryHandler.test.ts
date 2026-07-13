import { describe, expect, it, vi } from "vitest";
import { AssetId, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { AssetSharedToTeam } from "../../../domain/asset/events/AssetSharedToTeam.ts";
import {
  AssetSharedToTeamTelemetryHandler,
  mapAssetSharedToTeamTelemetry,
} from "./AssetSharedToTeamTelemetryHandler.ts";

describe("AssetSharedToTeamTelemetryHandler", () => {
  it("maps ids and roles without PII names", () => {
    const event = AssetSharedToTeam({
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      actorId: UserId.generate(),
      assetName: "Secret Truck Name",
      teamId: TeamId.generate(),
      teamName: "Secret Team Name",
    });

    const point = mapAssetSharedToTeamTelemetry(event);

    expect(point.indexes).toEqual([event.ownerId]);
    expect(point.blobs).toEqual([
      "AssetSharedToTeam",
      "Asset",
      event.assetId,
      event.ownerId,
      event.teamId,
      event.actorId,
      "ShareAsset",
      "v1",
      "success",
    ]);
    expect(point.blobs.join(" ")).not.toContain("Secret");
    expect(point.doubles).toEqual([1, event.occurredAt.getTime()]);
  });

  it("writes through the sink", () => {
    const write = vi.fn();
    const handler = new AssetSharedToTeamTelemetryHandler({ write });
    const event = AssetSharedToTeam({
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
