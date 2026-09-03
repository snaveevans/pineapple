import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { MaintenanceTask } from "../domain/maintenance/MaintenanceTask.ts";
import { serializeMaintenanceTask } from "./serializeMaintenanceTask.ts";

const TODAY = "2026-06-11";

describe("serializeMaintenanceTask", () => {
  it("returns exactly the public contract fields, including the rescheduled nextDue", () => {
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-05-11",
      nextDue: "2026-09-15",
      createdAt: new Date("2026-05-11T12:00:00.000Z"),
      scheduleSeedDate: "2026-05-11",
      initialLastCompletedDate: "2026-05-11",
      revision: 3,
      nextDueOverride: "2026-09-15",
    });

    const body = serializeMaintenanceTask(task, TODAY);

    expect(Object.keys(body).sort()).toEqual([
      "assetId",
      "createdAt",
      "daysDue",
      "id",
      "intervalUnit",
      "intervalValue",
      "lastCompletedDate",
      "nextDue",
      "status",
      "title",
    ]);
    expect(body.nextDue).toBe("2026-09-15");
    expect(body.status).toBe("ok");
    expect(body.daysDue).toBe(96);
  });

  it("never leaks internal fields to the API response", () => {
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: null,
      nextDue: "2026-07-01",
      createdAt: new Date(),
      scheduleSeedDate: "2026-06-11",
      initialLastCompletedDate: null,
      revision: 7,
      nextDueOverride: "2026-09-15",
    });

    const body = JSON.parse(JSON.stringify(serializeMaintenanceTask(task, TODAY))) as Record<
      string,
      unknown
    >;

    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("scheduleSeedDate");
    expect(body).not.toHaveProperty("initialLastCompletedDate");
    expect(body).not.toHaveProperty("nextDueOverride");
    expect(body).not.toHaveProperty("revision");
  });
});
