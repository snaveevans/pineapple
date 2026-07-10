import { describe, it, expect } from "vitest";
import { UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { Team } from "./Team.ts";

describe("Team", () => {
  const ownerId = UserId.generate();

  it("creates a team owned by the creator and emits TeamCreated", () => {
    const team = Team.create({ ownerId, name: "The Smiths" });

    expect(team.name).toBe("The Smiths");
    expect(team.ownerId).toBe(ownerId);
    expect(team.members).toEqual([{ userId: ownerId, role: "owner" }]);
    expect(team.isMember(ownerId)).toBe(true);
    expect(team.isMember(UserId.generate())).toBe(false);

    const events = team.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("TeamCreated");
    expect(events[0]).toMatchObject({
      teamId: team.id,
      ownerId,
      actorId: ownerId,
      name: "The Smiths",
    });

    // Second pull returns empty — events are drained
    expect(team.pullEvents()).toHaveLength(0);
  });

  it("trims whitespace from name", () => {
    const team = Team.create({ ownerId, name: "  The Smiths  " });
    expect(team.name).toBe("The Smiths");
  });

  it("rejects blank name", () => {
    expect(() => Team.create({ ownerId, name: "   " })).toThrow(ValidationError);
  });

  it("rejects over-length name", () => {
    const longName = "a".repeat(101);
    expect(() => Team.create({ ownerId, name: longName })).toThrow(ValidationError);
  });

  it("reconstitutes without emitting events", () => {
    const original = Team.create({ ownerId, name: "The Smiths" });
    original.pullEvents(); // drain

    const reconstituted = Team.reconstitute({
      id: original.id,
      name: original.name,
      members: [...original.members],
      createdAt: original.createdAt,
    });

    expect(reconstituted.pullEvents()).toHaveLength(0);
    expect(reconstituted.name).toBe("The Smiths");
    expect(reconstituted.ownerId).toBe(ownerId);
  });
});
