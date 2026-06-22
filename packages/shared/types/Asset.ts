export const ASSET_TYPES = ["vehicle", "property", "equipment"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export type AssetCategoryCounts = { all: number } & Record<AssetType, number>;

export function createAssetCategoryCounts(): AssetCategoryCounts {
  const countsByType = Object.fromEntries(ASSET_TYPES.map((type) => [type, 0])) as Record<
    AssetType,
    number
  >;

  return { all: 0, ...countsByType };
}
