import { describe, expect, it } from "vitest";
import { sharingBadge } from "./sharingPresentation";

describe("sharingBadge", () => {
  it("returns null for personal assets", () => {
    expect(sharingBadge({ scope: "personal", isOwner: true })).toBeNull();
    expect(sharingBadge({ scope: "personal", isOwner: false })).toBeNull();
  });

  it("labels owned team-shared assets as shared with team", () => {
    expect(sharingBadge({ scope: "team", isOwner: true })).toEqual({
      kind: "shared-with-team",
      text: "Shared with team",
    });
  });

  it("attributes teammate-shared assets to the owner display name", () => {
    expect(
      sharingBadge({
        scope: "team",
        isOwner: false,
        ownerDisplayName: "Pat Rivera",
      }),
    ).toEqual({
      kind: "shared-by",
      text: "Shared by Pat Rivera",
    });
  });

  it("falls back when owner display name is missing", () => {
    expect(sharingBadge({ scope: "team", isOwner: false })).toEqual({
      kind: "shared-by",
      text: "Shared by a teammate",
    });
    expect(sharingBadge({ scope: "team", isOwner: false, ownerDisplayName: "   " })).toEqual({
      kind: "shared-by",
      text: "Shared by a teammate",
    });
  });
});
