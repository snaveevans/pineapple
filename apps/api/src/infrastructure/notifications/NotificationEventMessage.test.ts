import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { MaintenanceTaskAdvanced } from "../../domain/maintenance/events/MaintenanceTaskAdvanced.ts";
import { MaintenanceTaskCreated } from "../../domain/maintenance/events/MaintenanceTaskCreated.ts";
import { MaintenanceTaskDeleted } from "../../domain/maintenance/events/MaintenanceTaskDeleted.ts";
import { AssetCreated } from "../../domain/asset/events/AssetCreated.ts";
import {
  isNotificationEventMessage,
  toNotificationEventMessage,
} from "./NotificationEventMessage.ts";

const base = {
  maintenanceTaskId: MaintenanceTaskId.generate(),
  assetId: AssetId.generate(),
  ownerId: UserId.generate(),
  actorId: UserId.generate(),
  assetName: "Truck",
  assetType: "vehicle" as const,
  title: "Oil change",
};

describe("toNotificationEventMessage", () => {
  it("converts MaintenanceTaskCreated with the nextDue conclusion and snapshot", () => {
    const event = MaintenanceTaskCreated({
      ...base,
      intervalValue: 3,
      intervalUnit: "month",
      nextDue: "2026-10-01",
    });
    const msg = toNotificationEventMessage(event);
    expect(msg).toMatchObject({
      type: "MaintenanceTaskCreated",
      maintenanceTaskId: base.maintenanceTaskId,
      taskTitle: "Oil change",
      assetName: "Truck",
      nextDue: "2026-10-01",
    });
    expect(msg && isNotificationEventMessage(msg)).toBe(true);
  });

  it("converts MaintenanceTaskAdvanced with record id, performedAt, and nextDue", () => {
    const event = MaintenanceTaskAdvanced({
      ...base,
      maintenanceRecordId: MaintenanceRecordId.generate(),
      performedAt: "2026-07-01",
      nextDue: "2026-10-01",
    });
    const msg = toNotificationEventMessage(event);
    expect(msg).toMatchObject({
      type: "MaintenanceTaskAdvanced",
      nextDue: "2026-10-01",
      performedAt: "2026-07-01",
    });
    expect(msg && "maintenanceRecordId" in msg && typeof msg.maintenanceRecordId === "string").toBe(
      true,
    );
    expect(msg && isNotificationEventMessage(msg)).toBe(true);
  });

  it("converts MaintenanceTaskDeleted without a nextDue", () => {
    const event = MaintenanceTaskDeleted(base);
    const msg = toNotificationEventMessage(event);
    expect(msg?.type).toBe("MaintenanceTaskDeleted");
    expect(msg && "nextDue" in msg).toBe(false);
    expect(msg && isNotificationEventMessage(msg)).toBe(true);
  });

  it("ignores unrelated domain events", () => {
    const event = AssetCreated({
      assetId: base.assetId,
      ownerId: base.ownerId,
      actorId: base.actorId,
      assetName: "Truck",
      assetType: "vehicle",
    });
    expect(toNotificationEventMessage(event)).toBeNull();
  });
});

describe("isNotificationEventMessage", () => {
  const created = toNotificationEventMessage(
    MaintenanceTaskCreated({
      ...base,
      intervalValue: 1,
      intervalUnit: "year",
      nextDue: "2027-07-01",
    }),
  );

  it("accepts a well-formed message", () => {
    expect(isNotificationEventMessage(created)).toBe(true);
  });

  it("rejects a MaintenanceTaskAdvanced missing performedAt", () => {
    const bad = {
      ...created,
      type: "MaintenanceTaskAdvanced",
      nextDue: "2027-07-01",
      maintenanceRecordId: "r",
    };
    expect(isNotificationEventMessage(bad)).toBe(false);
  });

  it("rejects a message missing common fields", () => {
    const rest = { ...(created as Record<string, unknown>) };
    delete rest.ownerId;
    expect(isNotificationEventMessage(rest)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isNotificationEventMessage(null)).toBe(false);
    expect(isNotificationEventMessage("x")).toBe(false);
  });
});
