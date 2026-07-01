import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { UserNameUpdated } from "../../../domain/identity/events/UserNameUpdated.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  mapUserNameUpdatedTelemetry,
  UserNameUpdatedTelemetryHandler,
} from "./UserNameUpdatedTelemetryHandler.ts";

describe("UserNameUpdatedTelemetryHandler", () => {
  const event: UserNameUpdated = {
    id: DomainEventId.generate(),
    type: "UserNameUpdated",
    userId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    occurredAt: new Date("2026-06-11T12:00:00.000Z"),
  };

  it("maps UserNameUpdated to the documented Analytics Engine field order", () => {
    expect(mapUserNameUpdatedTelemetry(event)).toEqual({
      indexes: [event.userId],
      blobs: ["UserNameUpdated", "User", event.userId, "v1", "success", "UpdateUserProfile"],
      doubles: [1, event.occurredAt.getTime()],
    });
  });

  it("writes mapped data points to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new UserNameUpdatedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapUserNameUpdatedTelemetry(event)]);
  });
});
