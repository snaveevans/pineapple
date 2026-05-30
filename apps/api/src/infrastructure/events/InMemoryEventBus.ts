import type { DomainEventHandler, EventBus } from "../../application/ports/EventBus.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";

export class InMemoryEventBus implements EventBus {
  readonly #handlers = new Map<string, DomainEventHandler[]>();

  subscribe<TEvent extends DomainEvent>(handler: DomainEventHandler<TEvent>): void {
    const handlers = this.#handlers.get(handler.eventType) ?? [];
    handlers.push(handler);
    this.#handlers.set(handler.eventType, handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.#handlers.get(event.type) ?? [];
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler.handle(event);
        } catch (error) {
          console.error({ eventType: event.type, error }, "Domain event handler failed");
        }
      }),
    );
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
