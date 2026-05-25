export type AssetId = string & { readonly _brand: "AssetId" };

export const AssetId = {
  generate: (): AssetId => crypto.randomUUID() as AssetId,
  from: (raw: string): AssetId => raw as AssetId,
};
