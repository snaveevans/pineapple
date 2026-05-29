import { z } from "zod";

const VehicleMetadataSchema = z.object({
  kind: z.literal("vehicle"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z
    .number()
    .int()
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 1, "Year is too far in the future"),
  vin: z.string().length(17, "VIN must be exactly 17 characters").optional(),
});

const PropertyMetadataSchema = z.object({
  kind: z.literal("property"),
  nickname: z.string().optional(),
  address: z.object({
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    postalCode: z.string().min(1, "Postal code is required"),
    country: z.string().min(1, "Country is required"),
  }),
});

const EquipmentMetadataSchema = z.object({
  kind: z.literal("equipment"),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  serialNumber: z.string().optional(),
});

const AssetMetadataSchema = z.discriminatedUnion("kind", [
  VehicleMetadataSchema,
  PropertyMetadataSchema,
  EquipmentMetadataSchema,
]);

export const CreateAssetBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  metadata: AssetMetadataSchema,
});

export type CreateAssetBody = z.infer<typeof CreateAssetBodySchema>;
