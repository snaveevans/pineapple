import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../events/DomainEvent.ts";
import type { Asset } from "./Asset.ts";

export interface AssetRepository {
  findById(id: AssetId): Promise<Asset | null>;
  findByOwner(ownerId: UserId): Promise<Asset[]>;
  save(asset: Asset, events?: readonly DomainEvent[]): Promise<void>;
}
