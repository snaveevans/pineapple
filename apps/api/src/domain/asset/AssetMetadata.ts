import { ValidationError } from "@snaveevans/pineapple-shared";
import { ASSET_FIELD_LIMITS, VIN_PATTERN } from "./AssetConstraints";

export type AssetMetadata = VehicleMetadata | PropertyMetadata | EquipmentMetadata;

export type VehicleMetadata = {
  kind: "vehicle";
  make: string;
  model: string;
  year: number;
  vin?: string;
};

export type PropertyMetadata = {
  kind: "property";
  nickname?: string;
  address: Address;
};

export type EquipmentMetadata = {
  kind: "equipment";
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
};

export type Address = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function assertMaxLength(
  value: string | undefined,
  maxLength: number,
  field: string,
  label: string,
): void {
  if (value !== undefined && value.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`, field);
  }
}

export function validateMetadata(metadata: AssetMetadata): void {
  switch (metadata.kind) {
    case "vehicle": {
      if (!metadata.make?.trim()) throw new ValidationError("Make required", "metadata.make");
      if (!metadata.model?.trim()) throw new ValidationError("Model required", "metadata.model");
      assertMaxLength(metadata.make, ASSET_FIELD_LIMITS.vehicleMake, "metadata.make", "Make");
      assertMaxLength(metadata.model, ASSET_FIELD_LIMITS.vehicleModel, "metadata.model", "Model");
      const currentYear = new Date().getFullYear();
      if (metadata.year < 1900 || metadata.year > currentYear + 1) {
        throw new ValidationError("Invalid year", "metadata.year");
      }
      if (metadata.vin !== undefined && !VIN_PATTERN.test(metadata.vin)) {
        throw new ValidationError("VIN must be 17 VIN-safe characters", "metadata.vin");
      }
      return;
    }
    case "property": {
      const a = metadata.address;
      assertMaxLength(
        metadata.nickname,
        ASSET_FIELD_LIMITS.propertyNickname,
        "metadata.nickname",
        "Nickname",
      );
      if (!a.street?.trim())
        throw new ValidationError("Street required", "metadata.address.street");
      if (!a.city?.trim()) throw new ValidationError("City required", "metadata.address.city");
      if (!a.state?.trim()) throw new ValidationError("State required", "metadata.address.state");
      if (!a.postalCode?.trim())
        throw new ValidationError("Postal code required", "metadata.address.postalCode");
      if (!a.country?.trim())
        throw new ValidationError("Country required", "metadata.address.country");
      assertMaxLength(
        a.street,
        ASSET_FIELD_LIMITS.propertyStreet,
        "metadata.address.street",
        "Street",
      );
      assertMaxLength(a.city, ASSET_FIELD_LIMITS.propertyCity, "metadata.address.city", "City");
      assertMaxLength(a.state, ASSET_FIELD_LIMITS.propertyState, "metadata.address.state", "State");
      assertMaxLength(
        a.postalCode,
        ASSET_FIELD_LIMITS.propertyPostalCode,
        "metadata.address.postalCode",
        "Postal code",
      );
      assertMaxLength(
        a.country,
        ASSET_FIELD_LIMITS.propertyCountry,
        "metadata.address.country",
        "Country",
      );
      return;
    }
    case "equipment":
      assertMaxLength(
        metadata.manufacturer,
        ASSET_FIELD_LIMITS.equipmentManufacturer,
        "metadata.manufacturer",
        "Manufacturer",
      );
      assertMaxLength(
        metadata.modelNumber,
        ASSET_FIELD_LIMITS.equipmentModelNumber,
        "metadata.modelNumber",
        "Model number",
      );
      assertMaxLength(
        metadata.serialNumber,
        ASSET_FIELD_LIMITS.equipmentSerialNumber,
        "metadata.serialNumber",
        "Serial number",
      );
      return;
  }
}
