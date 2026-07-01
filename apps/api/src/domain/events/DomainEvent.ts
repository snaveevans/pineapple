export type DomainEventId = string & { readonly _brand: "DomainEventId" };

export const DomainEventId = {
  generate: (): DomainEventId => crypto.randomUUID() as DomainEventId,
  from: (raw: string): DomainEventId => raw as DomainEventId,
};

export type DomainEvent = {
  readonly id: DomainEventId;
  readonly type: string;
  readonly occurredAt: Date;
};

export function createDomainEventMetadata(): Pick<DomainEvent, "id" | "occurredAt"> {
  return {
    id: DomainEventId.generate(),
    occurredAt: new Date(),
  };
}
