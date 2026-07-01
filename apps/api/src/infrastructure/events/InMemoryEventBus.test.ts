import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./InMemoryEventBus.ts";
import { DomainEventId, type DomainEvent } from "../../domain/events/DomainEvent.ts";

describe("InMemoryEventBus", () => {
  const event: DomainEvent = {
    id: DomainEventId.generate(),
    type: "AssetCreated",
    occurredAt: new Date("2026-05-29T12:00:00.000Z"),
  };

  it("publishes events to matching handlers", async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];

    bus.subscribe({
      eventType: "AssetCreated",
      handle: (published) => {
        received.push(published);
      },
    });

    await bus.publish(event);

    expect(received).toEqual([event]);
  });

  it("isolates handler failures from publishers and other handlers", async () => {
    const bus = new InMemoryEventBus();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const received: DomainEvent[] = [];

    bus.subscribe({
      eventType: "AssetCreated",
      handle: () => {
        throw new Error("telemetry failed");
      },
    });
    bus.subscribe({
      eventType: "AssetCreated",
      handle: (published) => {
        received.push(published);
      },
    });

    await expect(bus.publish(event)).resolves.toBeUndefined();

    expect(received).toEqual([event]);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
