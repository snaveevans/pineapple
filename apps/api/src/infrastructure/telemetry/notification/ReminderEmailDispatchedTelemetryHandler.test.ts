import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DomainEventId } from "../../../domain/events/DomainEvent.ts";
import type { ReminderEmailDispatched } from "../../../domain/notification/events/ReminderEmailDispatched.ts";
import type { TelemetryDataPoint, TelemetrySink } from "../AnalyticsEngineTelemetrySink.ts";
import {
  ReminderEmailDispatchedTelemetryHandler,
  mapReminderEmailDispatchedTelemetry,
} from "./ReminderEmailDispatchedTelemetryHandler.ts";

describe("ReminderEmailDispatchedTelemetryHandler", () => {
  const event: ReminderEmailDispatched = {
    id: DomainEventId.generate(),
    type: "ReminderEmailDispatched",
    emailBatchId: EmailBatchId.from("879e35eb-a27c-4a63-98c9-cd72ef032c1b"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    result: "suppressed",
    suppressReason: "unverified",
    notificationCount: 3,
    occurredAt: new Date("2026-07-02T12:00:00.000Z"),
  };

  it("maps the event to the documented Analytics Engine field order without PII", () => {
    expect(mapReminderEmailDispatchedTelemetry(event)).toEqual({
      indexes: [event.ownerId],
      blobs: [
        "ReminderEmailDispatched",
        "Notification",
        event.emailBatchId,
        event.ownerId,
        "v1",
        "suppressed",
        "unverified",
      ],
      doubles: [1, event.occurredAt.getTime(), 3],
    });
  });

  it("writes the mapped data point to the sink", () => {
    const writes: TelemetryDataPoint[] = [];
    const sink: TelemetrySink = {
      write: (dataPoint) => {
        writes.push(dataPoint);
      },
    };

    new ReminderEmailDispatchedTelemetryHandler(sink).handle(event);

    expect(writes).toEqual([mapReminderEmailDispatchedTelemetry(event)]);
  });
});
