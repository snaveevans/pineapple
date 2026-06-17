import { describe, expect, it } from "vitest";
import {
  formatDashboardGreeting,
  profileAvatarInitial,
  profileFirstName,
} from "./profilePresentation";

describe("profilePresentation", () => {
  it("uses the first word of the domain profile name in the greeting", () => {
    expect(formatDashboardGreeting("Dale Evans")).toBe("Hey Dale");
    expect(profileFirstName("DIYer Dale")).toBe("DIYer");
  });

  it("derives the avatar initial from the saved display name", () => {
    expect(profileAvatarInitial("dale")).toBe("D");
    expect(profileAvatarInitial("  Dale Evans ")).toBe("D");
  });

  it("falls back when the profile name is missing", () => {
    expect(formatDashboardGreeting(null)).toBe("Hey there");
    expect(profileAvatarInitial(null)).toBe("?");
  });
});
