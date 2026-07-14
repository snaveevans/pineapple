import { describe, expect, it } from "vitest";
import { activityActorLabel } from "./activityPresentation";

describe("activityActorLabel", () => {
  const viewerId = "7d914909-c903-41a4-a13a-82cbd0f61851";
  const teammateId = "71afbc20-f2e0-4fc8-a989-278437cf792c";

  it("labels the viewer's own actions as You", () => {
    expect(activityActorLabel({ id: viewerId, displayName: "Dale" }, viewerId)).toBe("You");
  });

  it("labels teammate actions with their display-name snapshot", () => {
    expect(activityActorLabel({ id: teammateId, displayName: "Pat Rivera" }, viewerId)).toBe(
      "Pat Rivera",
    );
  });

  it("falls back to Unknown when the snapshot is blank", () => {
    expect(activityActorLabel({ id: teammateId, displayName: "  " }, viewerId)).toBe("Unknown");
  });
});
