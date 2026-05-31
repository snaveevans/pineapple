// Import `z` from @hono/zod-openapi (not "zod") so schemas carry `.openapi()`
// metadata. This is the single source of truth for both runtime validation
// AND the generated OpenAPI spec — change a rule here and the docs follow.
import { z } from "@hono/zod-openapi";
import { ASSET_FIELD_LIMITS, VIN_PATTERN } from "../../domain/asset/AssetConstraints.ts";
import { ASSET_TYPES } from "../../domain/asset/AssetType.ts";

// ── Asset metadata (discriminated by `kind`) ─────────────────────────────────

const VehicleMetadataSchema = z
  .object({
    kind: z.literal("vehicle"),
    make: z
      .string()
      .trim()
      .min(1, "Make is required")
      .max(ASSET_FIELD_LIMITS.vehicleMake)
      .openapi({ example: "Ram" }),
    model: z
      .string()
      .trim()
      .min(1, "Model is required")
      .max(ASSET_FIELD_LIMITS.vehicleModel)
      .openapi({ example: "2500" }),
    year: z
      .number()
      .int()
      .min(1900, "Year must be 1900 or later")
      .max(new Date().getFullYear() + 1, "Year is too far in the future")
      .openapi({ example: 2016 }),
    vin: z
      .string()
      .length(17, "VIN must be exactly 17 characters")
      .regex(VIN_PATTERN, "VIN must use VIN-safe characters")
      .optional()
      .openapi({ example: "1C6RR7LT4GS123456" }),
  })
  .openapi("VehicleMetadata");

const PropertyMetadataSchema = z
  .object({
    kind: z.literal("property"),
    nickname: z
      .string()
      .trim()
      .max(ASSET_FIELD_LIMITS.propertyNickname)
      .optional()
      .openapi({ example: "Lake cabin" }),
    address: z
      .object({
        street: z
          .string()
          .trim()
          .min(1, "Street is required")
          .max(ASSET_FIELD_LIMITS.propertyStreet),
        city: z.string().trim().min(1, "City is required").max(ASSET_FIELD_LIMITS.propertyCity),
        state: z.string().trim().min(1, "State is required").max(ASSET_FIELD_LIMITS.propertyState),
        postalCode: z
          .string()
          .trim()
          .min(1, "Postal code is required")
          .max(ASSET_FIELD_LIMITS.propertyPostalCode),
        country: z
          .string()
          .trim()
          .min(1, "Country is required")
          .max(ASSET_FIELD_LIMITS.propertyCountry),
      })
      .openapi("Address"),
  })
  .openapi("PropertyMetadata");

const EquipmentMetadataSchema = z
  .object({
    kind: z.literal("equipment"),
    manufacturer: z
      .string()
      .trim()
      .max(ASSET_FIELD_LIMITS.equipmentManufacturer)
      .optional()
      .openapi({ example: "Honda" }),
    modelNumber: z
      .string()
      .trim()
      .max(ASSET_FIELD_LIMITS.equipmentModelNumber)
      .optional()
      .openapi({ example: "EU2200i" }),
    serialNumber: z
      .string()
      .trim()
      .max(ASSET_FIELD_LIMITS.equipmentSerialNumber)
      .optional()
      .openapi({ example: "EAMT-1234567" }),
  })
  .openapi("EquipmentMetadata");

export const AssetMetadataSchema = z
  .discriminatedUnion("kind", [
    VehicleMetadataSchema,
    PropertyMetadataSchema,
    EquipmentMetadataSchema,
  ])
  .openapi("AssetMetadata");

// ── Requests ─────────────────────────────────────────────────────────────────

export const CreateAssetBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(ASSET_FIELD_LIMITS.name)
      .openapi({ example: "My Truck" }),
    metadata: AssetMetadataSchema,
  })
  .openapi("CreateAssetBody");

export type CreateAssetBody = z.infer<typeof CreateAssetBodySchema>;

export const AssetIdParamSchema = z.object({
  id: z.string().openapi({
    param: { name: "id", in: "path" },
    example: "195d0ef0-47f5-439f-abfd-29f892c9a040",
  }),
});

// ── Responses ──────────────────────────────────────────────────────────────

/** Serialized asset, matching `serializeAsset` in worker.ts. */
export const AssetResponseSchema = z
  .object({
    id: z.string().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    name: z.string().openapi({ example: "My Truck" }),
    type: z.enum(ASSET_TYPES).openapi({ example: "vehicle" }),
    metadata: AssetMetadataSchema,
    archivedAt: z.string().datetime().nullable().openapi({ example: null }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-29T03:25:24.887Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-29T03:25:24.887Z" }),
  })
  .openapi("Asset");

export const AssetListResponseSchema = z
  .object({ assets: z.array(AssetResponseSchema) })
  .openapi("AssetListResponse");

export const CreatedAssetResponseSchema = z
  .object({
    id: z.string().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
  })
  .openapi("CreatedAsset");

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "Asset not found" }),
    field: z.string().optional().openapi({ example: "metadata.year" }),
  })
  .openapi("Error");

export const HealthResponseSchema = z.object({ status: z.literal("ok") }).openapi("Health");
