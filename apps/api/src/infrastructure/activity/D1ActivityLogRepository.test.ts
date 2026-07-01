import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
  ValidationError,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { ActivityEventMessage } from "./ActivityEventMessage.ts";
import { D1ActivityLogRepository } from "./D1ActivityLogRepository.ts";

function createDatabaseHarness() {
  const statements: { query: string; values: unknown[]; run: ReturnType<typeof vi.fn> }[] = [];
  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        const run = vi.fn().mockResolvedValue({ success: true });
        statements.push({ query, values, run });
        return {
          run,
          all: vi.fn().mockResolvedValue({ results: [] }),
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const db = { prepare } as unknown as D1Database;
  return { db, prepare, statements };
}

function baseEvent(overrides: Partial<ActivityEventMessage> = {}): ActivityEventMessage {
  return {
    id: "e2d3cf94-3779-43ea-b595-dac35dcba45a",
    type: "MaintenanceTaskAdvanced",
    occurredAt: "2026-06-09T18:25:24.887Z",
    assetId: AssetId.from("195d0ef0-47f5-439f-abfd-29f892c9a040"),
    ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
    actorId: UserId.from("71afbc20-f2e0-4fc8-a989-278437cf792c"),
    assetName: "Truck",
    assetType: "vehicle",
    activityEntryType: "task_completed",
    maintenanceTaskId: MaintenanceTaskId.from("a1b2c3d4-e5f6-4890-abcd-ef1234567890"),
    maintenanceRecordId: MaintenanceRecordId.from("e914b960-772f-46a7-b6fb-f333dcfc7fc9"),
    title: "Oil change",
    performedAt: "2026-06-09",
    ...overrides,
  } as ActivityEventMessage;
}

function encodeCursor(payload: object): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

describe("D1ActivityLogRepository", () => {
  it("projects task advancement as one task_completed activity entry", async () => {
    const { db, statements } = createDatabaseHarness();
    const event = baseEvent() as Extract<ActivityEventMessage, { type: "MaintenanceTaskAdvanced" }>;

    await new D1ActivityLogRepository(db).recordEvent(event);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain("INSERT INTO activity_entries");
    expect(statements[0]?.query).toContain("ON CONFLICT(source_event_id) DO NOTHING");
    expect(statements[0]?.query).not.toContain("INSERT OR IGNORE");
    expect(statements[0]?.values).toEqual([
      event.id,
      event.id,
      event.ownerId,
      event.actorId,
      "task_completed",
      event.occurredAt,
      event.assetId,
      event.assetName,
      event.assetType,
      event.title,
      event.performedAt,
      expect.any(String),
    ]);
  });

  it("does not create a maintenance_logged entry for a record collapsed into a task completion", async () => {
    const { db, prepare } = createDatabaseHarness();
    const event = baseEvent({
      type: "MaintenanceRecordCreated",
      activityEntryType: null,
      maintenanceRecordId: MaintenanceRecordId.from("e914b960-772f-46a7-b6fb-f333dcfc7fc9"),
      taskId: MaintenanceTaskId.from("a1b2c3d4-e5f6-4890-abcd-ef1234567890"),
      title: "Oil change",
      performedAt: "2026-06-09",
    });

    await new D1ActivityLogRepository(db).recordEvent(event);

    expect(prepare).not.toHaveBeenCalled();
  });

  it("projects a linked record as maintenance_logged when no task advancement occurred", async () => {
    const { db, statements } = createDatabaseHarness();
    const event = baseEvent({
      type: "MaintenanceRecordCreated",
      activityEntryType: "maintenance_logged",
      maintenanceRecordId: MaintenanceRecordId.from("e914b960-772f-46a7-b6fb-f333dcfc7fc9"),
      taskId: MaintenanceTaskId.from("a1b2c3d4-e5f6-4890-abcd-ef1234567890"),
      title: "Backdated oil change",
      performedAt: "2026-05-09",
    });

    await new D1ActivityLogRepository(db).recordEvent(event);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.values).toEqual([
      event.id,
      event.id,
      event.ownerId,
      event.actorId,
      "maintenance_logged",
      event.occurredAt,
      event.assetId,
      event.assetName,
      event.assetType,
      "Backdated oil change",
      "2026-05-09",
      expect.any(String),
    ]);
  });

  it("rejects malformed cursors as validation errors", async () => {
    const { db } = createDatabaseHarness();
    await expect(
      new D1ActivityLogRepository(db).list({
        ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
        limit: 25,
        cursor: "not-base64-json",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("skips aggregate filter scans on cursor pages", async () => {
    const { db, prepare } = createDatabaseHarness();
    const result = await new D1ActivityLogRepository(db).list({
      ownerId: UserId.from("7d914909-c903-41a4-a13a-82cbd0f61851"),
      limit: 25,
      cursor: encodeCursor({
        v: 1,
        occurredAt: "2026-06-09T18:25:24.887Z",
        id: "e2d3cf94-3779-43ea-b595-dac35dcba45a",
      }),
    });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(result.availableFilters).toEqual({ types: [], assets: [] });
  });
});
