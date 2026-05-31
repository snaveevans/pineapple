export const ASSET_FIELD_LIMITS = {
  name: 120,
  vehicleMake: 64,
  vehicleModel: 64,
  propertyNickname: 80,
  propertyStreet: 160,
  propertyCity: 80,
  propertyState: 80,
  propertyCountry: 80,
  propertyPostalCode: 20,
  equipmentManufacturer: 80,
  equipmentModelNumber: 80,
  equipmentSerialNumber: 80,
} as const;

/** VINs exclude I, O, and Q to avoid ambiguous characters. */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
