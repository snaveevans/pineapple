import type { AssetId, UserId } from "@snaveevans/pineapple-shared";
import type { Asset } from "./Asset";

export interface AssetRepository {
  findById(id: AssetId): Promise<Asset | null>;
  findByOwner(ownerId: UserId): Promise<Asset[]>;
  save(asset: Asset): Promise<void>;
}
