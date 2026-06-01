import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { assetsQueryKey, createAsset, type AssetType } from "../api/assets";
import { ApiError } from "../api/client";
import { Icon, type IconName } from "../design/Icon";
import { paths } from "../routes";
import { HFTopBar } from "./AppChrome";
import {
  EMPTY_ASSET_FORM,
  type AssetForm,
  type AssetFormErrors,
  toAssetFormError,
  toCreateAssetBody,
  validateAssetForm,
} from "./assetForm";

import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "../design/styles/hifi-add-asset.css";

type SetField = (
  key: keyof AssetForm,
) => (ev: { target: HTMLInputElement | HTMLSelectElement }) => void;

function focusFirstInvalid(scrollEl?: HTMLElement | null) {
  setTimeout(() => {
    const el = (scrollEl || document).querySelector<HTMLElement>(
      ".hf-input.is-invalid, .hf-select.is-invalid",
    );
    el?.focus();
  }, 0);
}

function HFField({
  label,
  required,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={`hf-field${error ? " has-error" : ""}`}>
      <label className="hf-field-label">
        {label}
        {required && <span className="hf-field-req">*</span>}
        {optional && <span className="hf-field-opt">optional</span>}
        {hint && <span className="hf-field-hint">{hint}</span>}
      </label>
      {children}
      {error && (
        <span className="hf-field-error" role="alert">
          <Icon name="alert" size={12} stroke={2} />
          {error}
        </span>
      )}
    </div>
  );
}

function HFTextField({
  label,
  required,
  optional,
  hint,
  placeholder,
  mono,
  value,
  onChange,
  error,
  inputMode,
  maxLength,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  placeholder?: string | undefined;
  mono?: boolean | undefined;
  value: string;
  onChange: (ev: { target: HTMLInputElement }) => void;
  error?: string | undefined;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search"
    | undefined;
  maxLength?: number | undefined;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint} error={error}>
      <input
        className={`hf-input${mono ? " hf-mono-input" : ""}${error ? " is-invalid" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </HFField>
  );
}

function HFSelectField({
  label,
  required,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  required?: boolean | undefined;
  options: string[];
  value: string;
  onChange: (ev: { target: HTMLSelectElement }) => void;
  error?: string | undefined;
}) {
  return (
    <HFField label={label} required={required} error={error}>
      <select
        className={`hf-select${error ? " is-invalid" : ""}`}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </HFField>
  );
}

function HFValidationBanner({ title, description }: { title: string; description: string }) {
  return (
    <div className="hf-aa-banner is-error" role="alert">
      <span className="hf-aa-banner-icon">
        <Icon name="alert" size={15} stroke={2} />
      </span>
      <div className="hf-aa-banner-text">
        <div className="hf-aa-banner-title">{title}</div>
        <div className="hf-aa-banner-sub">{description}</div>
      </div>
    </div>
  );
}

const HF_TYPES: { id: AssetType; icon: IconName; name: string; desc: string }[] = [
  { id: "vehicle", icon: "car", name: "Vehicle", desc: "Cars, trucks, vans, trailers" },
  { id: "property", icon: "home", name: "Property", desc: "Homes, land, and rentals" },
  { id: "equipment", icon: "wrench", name: "Equipment", desc: "Tools, HVAC, and generators" },
];

function HFTypePicker({ value, onChange }: { value: AssetType; onChange: (v: AssetType) => void }) {
  return (
    <div className="hf-aa-types" role="radiogroup" aria-label="Asset type">
      {HF_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          role="radio"
          aria-checked={value === type.id}
          className={`hf-type-card${value === type.id ? " selected" : ""}`}
          onClick={() => onChange(type.id)}
        >
          <span className="hf-type-radio" />
          <span className="hf-type-icon" data-cat={type.id}>
            <Icon name={type.icon} size={19} stroke={1.7} />
          </span>
          <span className="hf-type-text">
            <span className="hf-type-name">{type.name}</span>
            <span className="hf-type-desc">{type.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function HFVehicleFields({
  form,
  errors,
  setField,
}: {
  form: AssetForm;
  errors: AssetFormErrors;
  setField: SetField;
}) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Vehicle details</span>
      </div>
      <div className="hf-field-row">
        <HFTextField
          label="Make"
          required
          placeholder="Ford"
          value={form.make}
          onChange={setField("make")}
          error={errors.make}
        />
        <HFTextField
          label="Model"
          required
          placeholder="F-150"
          value={form.model}
          onChange={setField("model")}
          error={errors.model}
        />
        <HFTextField
          label="Year"
          required
          hint={`1900-${new Date().getFullYear() + 1}`}
          placeholder="2022"
          mono
          inputMode="numeric"
          maxLength={4}
          value={form.year}
          onChange={setField("year")}
          error={errors.year}
        />
      </div>
      <HFTextField
        label="VIN"
        optional
        hint="17 characters"
        placeholder="1C6RR7LT4GS123456"
        mono
        maxLength={17}
        value={form.vin}
        onChange={setField("vin")}
        error={errors.vin}
      />
    </div>
  );
}

function HFPropertyFields({
  form,
  errors,
  setField,
}: {
  form: AssetForm;
  errors: AssetFormErrors;
  setField: SetField;
}) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Property details</span>
        <span className="hf-aa-section-hint">full address required</span>
      </div>
      <HFTextField
        label="Nickname"
        optional
        placeholder="Main house, cabin..."
        value={form.nickname}
        onChange={setField("nickname")}
      />
      <HFTextField
        label="Street"
        required
        placeholder="12 Oak St, Apt 4"
        value={form.street}
        onChange={setField("street")}
        error={errors.street}
      />
      <div className="hf-field-row">
        <HFTextField
          label="City"
          required
          placeholder="Portland"
          value={form.city}
          onChange={setField("city")}
          error={errors.city}
        />
        <HFSelectField
          label="State"
          required
          options={["OR", "WA", "CA", "ID", "NV", "AZ"]}
          value={form.state}
          onChange={setField("state")}
          error={errors.state}
        />
        <HFTextField
          label="Postal"
          required
          placeholder="97204"
          mono
          value={form.postal}
          onChange={setField("postal")}
          error={errors.postal}
        />
      </div>
      <HFSelectField
        label="Country"
        required
        options={["United States", "Canada", "Mexico"]}
        value={form.country}
        onChange={setField("country")}
        error={errors.country}
      />
    </div>
  );
}

function HFEquipmentFields({ form, setField }: { form: AssetForm; setField: SetField }) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Equipment details</span>
        <span className="hf-aa-section-hint">fill in what you know</span>
      </div>
      <div className="hf-field-row">
        <HFTextField
          label="Manufacturer"
          optional
          placeholder="Honda"
          value={form.manufacturer}
          onChange={setField("manufacturer")}
        />
        <HFTextField
          label="Model number"
          optional
          placeholder="EU2200i"
          mono
          value={form.modelNumber}
          onChange={setField("modelNumber")}
        />
      </div>
      <HFTextField
        label="Serial number"
        optional
        placeholder="EAMT-1234567"
        mono
        value={form.serialNumber}
        onChange={setField("serialNumber")}
      />
    </div>
  );
}

function namePlaceholder(type: AssetType): string {
  switch (type) {
    case "vehicle":
      return "Ford F-150";
    case "property":
      return "12 Oak St";
    case "equipment":
      return "Pressure washer";
  }
}

export function AppAddAsset({ initialType = "vehicle" }: { initialType?: AssetType }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [type, setType] = useState<AssetType>(initialType);
  const [form, setForm] = useState<AssetForm>(EMPTY_ASSET_FORM);
  const [errors, setErrors] = useState<AssetFormErrors>({});
  const [banner, setBanner] = useState<{ title: string; description: string } | null>(null);

  const mutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assetsQueryKey });
      navigate(paths.assets);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate(paths.login(), { replace: true });
        return;
      }
      const fieldErrors =
        error instanceof ApiError ? toAssetFormError(error.field, error.message) : {};
      setErrors(fieldErrors);
      setBanner({
        title: "Asset could not be saved",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      focusFirstInvalid(bodyRef.current);
    },
  });

  const clearValidation = () => {
    setErrors({});
    setBanner(null);
    mutation.reset();
  };

  const setField: SetField = (key) => (ev) => {
    const value = ev.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setBanner(null);
    mutation.reset();
  };

  const selectType = (nextType: AssetType) => {
    setType(nextType);
    clearValidation();
  };

  const save = () => {
    const nextErrors = validateAssetForm(type, form);
    setErrors(nextErrors);
    const errorCount = Object.keys(nextErrors).length;
    if (errorCount > 0) {
      setBanner({
        title: errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`,
        description: "Fix the highlighted fields below, then save again.",
      });
      focusFirstInvalid(bodyRef.current);
      return;
    }
    mutation.mutate(toCreateAssetBody(type, form));
  };

  useEffect(() => {
    document.title = "FieldOps - Add Asset";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate(paths.assets);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const errorCount = Object.keys(errors).length;

  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />

      <div className="hf-aa-crumb">
        <Link to={paths.assets}>Assets</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">Add asset</span>
        <span className="hf-aa-crumb-esc">
          <kbd>esc</kbd> to cancel
        </span>
      </div>

      <div className="hf-aa-body" ref={bodyRef}>
        <div className="hf-aa-col">
          <div className="hf-aa-head">
            <h1>Add an asset</h1>
            <p>Track a vehicle, property, or piece of equipment.</p>
          </div>

          {banner && <HFValidationBanner title={banner.title} description={banner.description} />}

          <div className="hf-aa-section">
            <HFField label="Asset type" required>
              <HFTypePicker value={type} onChange={selectType} />
            </HFField>
          </div>

          <HFTextField
            label="Asset name"
            required
            hint="how you'll recognize it"
            placeholder={namePlaceholder(type)}
            value={form.name}
            onChange={setField("name")}
            error={errors.name}
          />

          <div className="hf-aa-rule" />

          {type === "vehicle" && (
            <HFVehicleFields form={form} errors={errors} setField={setField} />
          )}
          {type === "property" && (
            <HFPropertyFields form={form} errors={errors} setField={setField} />
          )}
          {type === "equipment" && <HFEquipmentFields form={form} setField={setField} />}
        </div>
      </div>

      <div className="hf-aa-footer">
        <div className="hf-aa-footer-note">
          {banner ? (
            <span className="hf-aa-footer-err">
              <Icon name="alert" size={13} stroke={2} />
              {errorCount > 0
                ? errorCount === 1
                  ? "1 field needs attention"
                  : `${errorCount} fields need attention`
                : "Asset could not be saved"}
            </span>
          ) : (
            <>
              Fields marked <span className="hf-field-req">*</span> are required
            </>
          )}
        </div>
        <div className="hf-aa-footer-actions">
          <button
            className="hf-btn hf-btn-secondary hf-btn-lg"
            onClick={() => navigate(paths.assets)}
          >
            Cancel
          </button>
          <button
            className="hf-btn hf-btn-primary hf-btn-lg"
            onClick={save}
            disabled={mutation.isPending}
          >
            <Icon name="check" size={15} stroke={2.2} />
            {mutation.isPending ? "Saving..." : "Save asset"}
          </button>
        </div>
      </div>
    </div>
  );
}
