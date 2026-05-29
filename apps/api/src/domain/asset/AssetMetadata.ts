import { ValidationError } from "@snaveevans/pineapple-shared";

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

export function validateMetadata(metadata: AssetMetadata): void {
  switch (metadata.kind) {
    case "vehicle": {
      if (!metadata.make?.trim()) throw new ValidationError("Make required", "metadata.make");
      if (!metadata.model?.trim()) throw new ValidationError("Model required", "metadata.model");
      const currentYear = new Date().getFullYear();
      if (metadata.year < 1900 || metadata.year > currentYear + 1) {
        throw new ValidationError("Invalid year", "metadata.year");
      }
      if (metadata.vin !== undefined && metadata.vin.length !== 17) {
        throw new ValidationError("VIN must be 17 characters", "metadata.vin");
      }
      return;
    }
    case "property": {
      const a = metadata.address;
      if (!a.street?.trim())
        throw new ValidationError("Street required", "metadata.address.street");
      if (!a.city?.trim()) throw new ValidationError("City required", "metadata.address.city");
      if (!a.state?.trim()) throw new ValidationError("State required", "metadata.address.state");
      if (!a.postalCode?.trim())
        throw new ValidationError("Postal code required", "metadata.address.postalCode");
      if (!a.country?.trim())
        throw new ValidationError("Country required", "metadata.address.country");
      return;
    }
    case "equipment":
      return;
  }
}
