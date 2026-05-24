import { User } from "@snaveevans/pineapple-domain";
import { describe, it, expect } from "vitest";

describe("User", () => {
  it("fails on missing user name", () => {
    expect(() => User.create({ name: "       " })).toThrow("User name is required");
  });

  it("succeeds", () => {
    const user = User.create({ name: "Ram 2500 " });
    expect(user.name).toEqual("Ram 2500");
  });
});
