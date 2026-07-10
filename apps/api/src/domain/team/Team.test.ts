import { describe, it, expect } from "vitest";
import { UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { Team } from "./Team.ts";

describe("Team", () => {
  const ownerId = UserId.generate();

  it("creates a team with the owner as the only member and emits TeamCreated", () => {
    const team = Team.create({ ownerId, name: "Field Ops" });

    expect(team.id).toBeDefined();
    expect(team.name).toBe("Field Ops");
    expect(team.ownerId).toBe(ownerId);
    expect(team.createdAt).toBeInstanceOf(Date);
    expect(team.members).toHaveLength(1);
    expect(team.members[0]).toMatchObject({
      userId: ownerId,
      role: "owner",
    });

    const events = team.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("TeamCreated");
    expect(events[0]).toMatchObject({
      teamId: team.id,
      ownerId,
      actorId: ownerId,
      teamName: "Field Ops",
    });

    expect(team.pullEvents()).toHaveLength(0);
  });

  it("trims whitespace from name", () => {
    const team = Team.create({ ownerId, name: "  Field Ops  " });
    expect(team.name).toBe("Field Ops");
  });

  it("rejects blank name", () => {
    expect(() => Team.create({ ownerId, name: "   " })).toThrow(ValidationError);
  });

  it("rejects name over 100 characters", () => {
    expect(() => Team.create({ ownerId, name: "x".repeat(101) })).toThrow(ValidationError);
  });

  it("accepts name of exactly 100 characters", () => {
    const team = Team.create({ ownerId, name: "x".repeat(100) });
    expect(team.name).toHaveLength(100);
  });

  it("reconstitutes without emitting events", () => {
    const original = Team.create({ ownerId, name: "Field Ops" });
    original.pullEvents();

    const reconstituted = Team.reconstitute({
      id: original.id,
      ownerId: original.ownerId,
      name: original.name,
      createdAt: original.createdAt,
      members: [...original.members],
    });

    expect(reconstituted.pullEvents()).toHaveLength(0);
    expect(reconstituted.name).toBe("Field Ops");
    expect(reconstituted.members).toHaveLength(1);
  });
});
