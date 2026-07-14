import { apiRequest } from "./client";
import type { AssetSharing, AssetType } from "./assets";

export type SearchResult = {
  id: string;
  name: string;
  type: AssetType;
  summary: string;
  sharing: AssetSharing;
};

export type SearchAssetsResponse = {
  results: SearchResult[];
};

export function searchAssets(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<SearchAssetsResponse> {
  const params = new URLSearchParams({ q: query });
  return apiRequest<SearchAssetsResponse>(
    `/api/search?${params.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}
