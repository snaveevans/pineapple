import type { CreateAssetPayload } from "../api/client";

export type AssetType = "vehicle" | "property" | "other";

export const ADD_ASSET_FIELD_LIMITS = {
  name: 120,
  vehicleMake: 64,
  vehicleModel: 64,
  vin: 17,
  propertyNickname: 80,
  propertyStreet: 160,
  propertyCity: 80,
  propertyState: 80,
  propertyPostalCode: 20,
  equipmentManufacturer: 80,
  equipmentModelNumber: 80,
  equipmentSerialNumber: 80,
} as const;

export type AddAssetFormValues = {
  name: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vin: string;
  propertyNickname: string;
  propertyStreet: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode: string;
  equipmentManufacturer: string;
  equipmentModelNumber: string;
  equipmentSerialNumber: string;
};

export const EMPTY_ADD_ASSET_FORM: AddAssetFormValues = {
  name: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vin: "",
  propertyNickname: "",
  propertyStreet: "",
  propertyCity: "",
  propertyState: "OR",
  propertyPostalCode: "",
  equipmentManufacturer: "",
  equipmentModelNumber: "",
  equipmentSerialNumber: "",
};

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function buildCreateAssetPayload(
  type: AssetType,
  values: AddAssetFormValues,
): CreateAssetPayload {
  const name = values.name.trim();
  if (type === "vehicle") {
    const year = Number(values.vehicleYear);
    const vin = optional(values.vin.toUpperCase());
    if (!Number.isInteger(year)) throw new Error("Enter a valid vehicle year");
    return {
      name,
      metadata: {
        kind: "vehicle",
        make: values.vehicleMake.trim(),
        model: values.vehicleModel.trim(),
        year,
        ...(vin ? { vin } : {}),
      },
    };
  }
  if (type === "property") {
    const nickname = optional(values.propertyNickname);
    return {
      name,
      metadata: {
        kind: "property",
        ...(nickname ? { nickname } : {}),
        address: {
          street: values.propertyStreet.trim(),
          city: values.propertyCity.trim(),
          state: values.propertyState.trim(),
          postalCode: values.propertyPostalCode.trim(),
          country: "US",
        },
      },
    };
  }
  const manufacturer = optional(values.equipmentManufacturer);
  const modelNumber = optional(values.equipmentModelNumber);
  const serialNumber = optional(values.equipmentSerialNumber);
  return {
    name,
    metadata: {
      kind: "equipment",
      ...(manufacturer ? { manufacturer } : {}),
      ...(modelNumber ? { modelNumber } : {}),
      ...(serialNumber ? { serialNumber } : {}),
    },
  };
}
