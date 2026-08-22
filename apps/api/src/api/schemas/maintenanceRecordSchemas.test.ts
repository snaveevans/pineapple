import {
  CreateMaintenanceRecordBodySchema,
  MaintenanceAssetIdParamSchema,
  MaintenanceRecordIdParamSchema,
  MaintenanceRecordResponseSchema,
  UpdateMaintenanceRecordBodySchema,
} from "./maintenanceRecordSchemas.ts";

describe("maintenance record schemas", () => {
  it("trims valid input and accepts omitted notes", () => {
    expect(
      CreateMaintenanceRecordBodySchema.parse({
        title: "  Changed oil  ",
        performedAt: "2026-06-09",
      }),
    ).toEqual({ title: "Changed oil", performedAt: "2026-06-09" });
  });

  it("accepts whitespace-only notes and trims them to an empty string", () => {
    expect(
      CreateMaintenanceRecordBodySchema.parse({
        title: "Changed oil",
        performedAt: "2026-06-09",
        notes: "   ",
      }),
    ).toEqual({ title: "Changed oil", performedAt: "2026-06-09", notes: "" });
  });

  it.each([
    { title: "", performedAt: "2026-06-09" },
    { title: "t".repeat(101), performedAt: "2026-06-09" },
    { title: "Maintenance", performedAt: "2026-02-29" },
    { title: "Maintenance", performedAt: "06/09/2026" },
    { title: "Maintenance", performedAt: "2026-06-09", notes: "n".repeat(1001) },
  ])("rejects invalid body %#", (body) => {
    expect(CreateMaintenanceRecordBodySchema.safeParse(body).success).toBe(false);
  });

  it("rejects malformed asset ids", () => {
    expect(MaintenanceAssetIdParamSchema.safeParse({ assetId: "not-a-uuid" }).success).toBe(false);
    expect(
      MaintenanceRecordIdParamSchema.safeParse({
        assetId: "not-a-uuid",
        recordId: "e914b960-772f-46a7-b6fb-f333dcfc7fc9",
      }).success,
    ).toBe(false);
  });

  it("accepts valid partial updates in UpdateMaintenanceRecordBodySchema", () => {
    expect(
      UpdateMaintenanceRecordBodySchema.parse({
        title: "Updated Oil",
        notes: null,
      }),
    ).toEqual({ title: "Updated Oil", notes: null });
  });

  it("rejects unknown/forbidden keys in UpdateMaintenanceRecordBodySchema with strict mode", () => {
    expect(
      UpdateMaintenanceRecordBodySchema.safeParse({
        title: "Oil Change",
        taskId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      }).success,
    ).toBe(false);
    expect(
      UpdateMaintenanceRecordBodySchema.safeParse({
        id: "e914b960-772f-46a7-b6fb-f333dcfc7fc9",
      }).success,
    ).toBe(false);
  });

  it("accepts the documented response shape with nullable notes", () => {
    expect(
      MaintenanceRecordResponseSchema.safeParse({
        id: "e914b960-772f-46a7-b6fb-f333dcfc7fc9",
        assetId: "195d0ef0-47f5-439f-abfd-29f892c9a040",
        title: "Changed oil",
        performedAt: "2026-06-09",
        notes: null,
        taskId: null,
        createdAt: "2026-06-09T18:25:24.887Z",
      }).success,
    ).toBe(true);
  });
});
