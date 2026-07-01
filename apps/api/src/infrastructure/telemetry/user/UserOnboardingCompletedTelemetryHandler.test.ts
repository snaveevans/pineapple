import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { UserOnboardingCompleted } from "../../../domain/identity/events/UserOnboardingCompleted.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  mapUserOnboardingCompletedTelemetry,
  UserOnboardingCompletedTelemetryHandler,
} from "./UserOnboardingCompletedTelemetryHandler.ts";

describe("UserOnboardingCompletedTelemetryHandler", () => {
  const event: UserOnboardingCompleted = {
    id: DomainEventId.generate(),
    type: "UserOnboardingCompleted",
    userId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    occurredAt: new Date("2026-06-11T12:00:00.000Z"),
  };

  it("maps UserOnboardingCompleted to the documented Analytics Engine field order", () => {
    expect(mapUserOnboardingCompletedTelemetry(event)).toEqual({
      indexes: [event.userId],
      blobs: [
        "UserOnboardingCompleted",
        "User",
        event.userId,
        "v1",
        "success",
        "UpdateUserProfile",
      ],
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

    new UserOnboardingCompletedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapUserOnboardingCompletedTelemetry(event)]);
  });
});
