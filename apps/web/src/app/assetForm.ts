import type { AssetType, CreateAssetBody } from "../api/assets";

export type AssetForm = {
  name: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  nickname: string;
  street: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
};

export type AssetFormErrors = Partial<Record<keyof AssetForm, string>>;

export const EMPTY_ASSET_FORM: AssetForm = {
  name: "",
  make: "",
  model: "",
  year: "",
  vin: "",
  nickname: "",
  street: "",
  city: "",
  state: "",
  postal: "",
  country: "United States",
  manufacturer: "",
  modelNumber: "",
  serialNumber: "",
};

const trimmedOrUndefined = (value: string) => value.trim() || undefined;

export function validateAssetForm(type: AssetType, form: AssetForm): AssetFormErrors {
  const errors: AssetFormErrors = {};
  const has = (value: string) => value.trim().length > 0;

  if (!has(form.name)) errors.name = "Required - give this asset a name.";

  if (type === "vehicle") {
    if (!has(form.make)) errors.make = "Required.";
    if (!has(form.model)) errors.model = "Required.";
    if (!has(form.year)) {
      errors.year = "Required.";
    } else if (!/^\d+$/.test(form.year.trim())) {
      errors.year = "Must be a whole number.";
    } else if (
      Number.parseInt(form.year, 10) < 1900 ||
      Number.parseInt(form.year, 10) > new Date().getFullYear() + 1
    ) {
      errors.year = `Must be between 1900 and ${new Date().getFullYear() + 1}.`;
    }
    const vin = form.vin.trim();
    if (vin && vin.length !== 17) {
      errors.vin = `VIN must be exactly 17 characters (${vin.length} entered).`;
    }
  } else if (type === "property") {
    if (!has(form.street)) errors.street = "Required.";
    if (!has(form.city)) errors.city = "Required.";
    if (!has(form.state)) errors.state = "Required.";
    if (!has(form.postal)) errors.postal = "Required.";
    if (!has(form.country)) errors.country = "Required.";
  }

  return errors;
}

export function toCreateAssetBody(type: AssetType, form: AssetForm): CreateAssetBody {
  const name = form.name.trim();

  switch (type) {
    case "vehicle": {
      const vin = trimmedOrUndefined(form.vin);
      return {
        name,
        metadata: {
          kind: "vehicle",
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number.parseInt(form.year, 10),
          ...(vin ? { vin } : {}),
        },
      };
    }
    case "property": {
      const nickname = trimmedOrUndefined(form.nickname);
      return {
        name,
        metadata: {
          kind: "property",
          ...(nickname ? { nickname } : {}),
          address: {
            street: form.street.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            postalCode: form.postal.trim(),
            country: form.country.trim(),
          },
        },
      };
    }
    case "equipment": {
      const manufacturer = trimmedOrUndefined(form.manufacturer);
      const modelNumber = trimmedOrUndefined(form.modelNumber);
      const serialNumber = trimmedOrUndefined(form.serialNumber);
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
  }
}

const API_FIELD_TO_FORM_FIELD: Record<string, keyof AssetForm> = {
  name: "name",
  "metadata.make": "make",
  "metadata.model": "model",
  "metadata.year": "year",
  "metadata.vin": "vin",
  "metadata.nickname": "nickname",
  "metadata.address.street": "street",
  "metadata.address.city": "city",
  "metadata.address.state": "state",
  "metadata.address.postalCode": "postal",
  "metadata.address.country": "country",
  "metadata.manufacturer": "manufacturer",
  "metadata.modelNumber": "modelNumber",
  "metadata.serialNumber": "serialNumber",
};

export function toAssetFormError(field: string | undefined, message: string): AssetFormErrors {
  const formField = field ? API_FIELD_TO_FORM_FIELD[field] : undefined;
  return formField ? { [formField]: message } : {};
}
