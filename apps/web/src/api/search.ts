import { apiGet } from "./client.ts";
import type { components } from "./schema.ts";

export type SearchResult = components["schemas"]["SearchResult"];
export type SearchAssetsResponse = components["schemas"]["SearchAssetsResponse"];

export function searchAssets(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<SearchAssetsResponse> {
  return apiGet("/api/search", {
    query: { q: query },
    ...(options?.signal ? { signal: options.signal } : {}),
  });
}
