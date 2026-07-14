import { describe, expect, it } from "vitest";
import { SearchAssetsQuerySchema, SearchAssetsResponseSchema } from "./searchSchemas.ts";

describe("search schemas", () => {
  it("trims a valid query", () => {
    expect(SearchAssetsQuerySchema.parse({ q: "  ram 2500  " })).toEqual({ q: "ram 2500" });
  });

  it.each([{ q: undefined }, { q: "" }, { q: "   " }, { q: "a".repeat(101) }])(
    "rejects invalid query %#",
    (query) => {
      expect(SearchAssetsQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it("accepts the documented response envelope", () => {
    expect(
      SearchAssetsResponseSchema.safeParse({
        results: [
          {
            id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
            name: "My Truck",
            type: "vehicle",
            summary: "2016 Ram 2500",
            sharing: { scope: "personal", isOwner: true },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires sharing on each search result", () => {
    expect(
      SearchAssetsResponseSchema.safeParse({
        results: [
          {
            id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
            name: "My Truck",
            type: "vehicle",
            summary: "2016 Ram 2500",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts ownerDisplayName when the asset is shared with the requester", () => {
    expect(
      SearchAssetsResponseSchema.safeParse({
        results: [
          {
            id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
            name: "My Truck",
            type: "vehicle",
            summary: "2016 Ram 2500",
            sharing: {
              scope: "team",
              isOwner: false,
              ownerDisplayName: "Pat",
            },
          },
        ],
      }).success,
    ).toBe(true);
  });
});
