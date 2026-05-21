import { Asset } from "@snaveevans/pineapple-domain";
import { describe, it, expect } from "vitest";

describe("Asset", () => {
  it("fails on missing asset name", () => {
    expect(() => Asset.create({ name: "       " })).toThrow("Asset name is required");
  });

  it("succeeds", () => {
    const asset = Asset.create({ name: "Ram 2500" });
    expect(asset.name).toEqual("Ram 2500");
  });
});
