import { describe, expect, it } from "vitest";
import { parseRecoveryArguments } from "./agent-operation-recovery.ts";

const ACTOR_ID = "239f68c0-c6a2-4550-8c5b-30e0f66fe7e2";
const OPERATION_ID = "188e5572-a712-4b1d-9f67-a260214ef953";

describe("agent operation recovery command arguments", () => {
  it.each(["inspect", "dry-run"] as const)("parses the read-only %s command", (command) => {
    expect(
      parseRecoveryArguments([command, "--actor", ACTOR_ID, "--operation", OPERATION_ID]),
    ).toEqual({ command, actorId: ACTOR_ID, operationId: OPERATION_ID });
  });

  it("requires an exact operation-specific confirmation for apply", () => {
    expect(
      parseRecoveryArguments([
        "apply",
        "--actor",
        ACTOR_ID,
        "--operation",
        OPERATION_ID,
        "--confirm-restore",
        OPERATION_ID,
      ]),
    ).toEqual({ command: "apply", actorId: ACTOR_ID, operationId: OPERATION_ID });
    expect(() =>
      parseRecoveryArguments([
        "apply",
        "--actor",
        ACTOR_ID,
        "--operation",
        OPERATION_ID,
        "--confirm-restore",
        ACTOR_ID,
      ]),
    ).toThrow();
  });

  it("rejects malformed, duplicate, and unrelated arguments", () => {
    expect(() =>
      parseRecoveryArguments(["inspect", "--actor", "not-a-uuid", "--operation", OPERATION_ID]),
    ).toThrow();
    expect(() =>
      parseRecoveryArguments([
        "dry-run",
        "--actor",
        ACTOR_ID,
        "--actor",
        ACTOR_ID,
        "--operation",
        OPERATION_ID,
      ]),
    ).toThrow();
    expect(() =>
      parseRecoveryArguments([
        "dry-run",
        "--actor",
        ACTOR_ID,
        "--operation",
        OPERATION_ID,
        "--confirm-restore",
        OPERATION_ID,
      ]),
    ).toThrow();
  });
});
