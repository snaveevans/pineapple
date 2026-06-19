import { z } from "@hono/zod-openapi";
import { ASSET_TYPES } from "../../domain/asset/AssetType.ts";

export const SearchAssetsQuerySchema = z
  .object({
    q: z
      .string({ required_error: "Search query is required" })
      .trim()
      .min(1, "Search query is required")
      .max(100, "Search query must be 100 characters or fewer")
      .openapi({
        param: { name: "q", in: "query" },
        example: "ram 2500",
      }),
  })
  .openapi("SearchAssetsQuery");

export const SearchResultSchema = z
  .object({
    id: z.string().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    name: z.string().openapi({ example: "My Truck" }),
    type: z.enum(ASSET_TYPES).openapi({ example: "vehicle" }),
    summary: z.string().openapi({ example: "2016 Ram 2500" }),
  })
  .openapi("SearchResult");

export const SearchAssetsResponseSchema = z
  .object({ results: z.array(SearchResultSchema) })
  .openapi("SearchAssetsResponse");
