import { describe, expect, it } from "vitest";
import { TeamId, UserId } from "@snaveevans/pineapple-shared";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import {
  TeamCreatedTelemetryHandler,
  mapTeamCreatedTelemetry,
} from "./TeamCreatedTelemetryHandler.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import type { TeamCreated } from "../../../domain/team/events/TeamCreated.ts";

describe("TeamCreatedTelemetryHandler", () => {
  const event: TeamCreated = {
    id: DomainEventId.generate(),
    type: "TeamCreated",
    teamId: TeamId.from("aaa11100-0000-0000-0000-000000000001"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    teamName: "Field Ops",
    occurredAt: new Date("2026-07-10T12:00:00.000Z"),
  };

  it("maps TeamCreated to the documented Analytics Engine field order", () => {
    expect(mapTeamCreatedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "TeamCreated",
        "Team",
        event.teamId,
        event.ownerId,
        event.actorId,
        "CreateTeam",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime()],
    });
  });

  it("does not include the team name (PII concern)", () => {
    const result = mapTeamCreatedTelemetry(event);
    expect(result.blobs).not.toContain("Field Ops");
  });

  it("writes mapped data points to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new TeamCreatedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapTeamCreatedTelemetry(event)]);
  });
});
