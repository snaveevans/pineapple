import { AssetId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { validateMetadata, type AssetMetadata } from "./AssetMetadata.ts";
import type { AssetType } from "./AssetType.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { AssetCreated } from "./events/AssetCreated.ts";

export class Asset {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: AssetId,
    readonly ownerId: UserId,
    public name: string,
    public metadata: AssetMetadata,
    public archivedAt: Date | null,
    readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  get type(): AssetType {
    return this.metadata.kind;
  }

  static create(props: { ownerId: UserId; name: string; metadata: AssetMetadata }): Asset {
    if (!props.name?.trim()) {
      throw new ValidationError("Asset name is required", "name");
    }
    validateMetadata(props.metadata);

    const now = new Date();
    const asset = new Asset(
      AssetId.generate(),
      props.ownerId,
      props.name.trim(),
      props.metadata,
      null,
      now,
      now,
    );
    asset._domainEvents.push(
      AssetCreated({
        assetId: asset.id,
        ownerId: asset.ownerId,
        actorId: asset.ownerId,
        assetName: asset.name,
        assetType: asset.type,
        ...(asset.metadata.kind === "vehicle" ? { assetModelYear: asset.metadata.year } : {}),
      }),
    );
    return asset;
  }

  static reconstitute(props: {
    id: AssetId;
    ownerId: UserId;
    name: string;
    metadata: AssetMetadata;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Asset {
    return new Asset(
      props.id,
      props.ownerId,
      props.name,
      props.metadata,
      props.archivedAt,
      props.createdAt,
      props.updatedAt,
    );
  }

  rename(name: string): void {
    if (!name?.trim()) throw new ValidationError("Name required", "name");
    this.name = name.trim();
    this.updatedAt = new Date();
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
