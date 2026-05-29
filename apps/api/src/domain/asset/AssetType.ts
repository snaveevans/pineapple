export const ASSET_TYPES = ["vehicle", "property", "equipment"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
