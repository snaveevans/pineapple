import type { DomainEvent } from "../../domain/events/DomainEvent.ts";

export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  readonly eventType: TEvent["type"];
  handle(event: TEvent): void | Promise<void>;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
  subscribe<TEvent extends DomainEvent>(handler: DomainEventHandler<TEvent>): void;
}
