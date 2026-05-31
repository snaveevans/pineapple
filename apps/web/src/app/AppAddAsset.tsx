import {
  useEffect,
  useState,
  type FormEvent,
  type HTMLInputTypeAttribute,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import { createAsset } from "../api/client";
import { Icon, type IconName } from "../design/Icon";
import { HFTopBar } from "./AppChrome";
import {
  ADD_ASSET_FIELD_LIMITS,
  buildCreateAssetPayload,
  EMPTY_ADD_ASSET_FORM,
  type AddAssetFormValues,
  type AssetType,
} from "./addAssetPayload";
import { paths } from "../routes";

// FieldOps — Add Asset. A focused single-page form on the .hf design system:
// a three-bucket type picker (Vehicle / Property / Other), contextual detail
// fields that reveal based on the chosen type/subtype, an optional photo
// dropzone, a deferred "set up a schedule" note, and a sticky save bar. Ported
// from the FieldOps design prototype (Add Asset.html / hifi-add-asset.jsx);
// styling comes from the shared .hf tokens in styles/hifi.css + hifi-assets.css
// plus the .hf-aa-* scopes in styles/hifi-add-asset.css.
import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "../design/styles/hifi-add-asset.css";

type Subtype = "lawn" | "power-tool" | "appliance" | "hvac" | "generator" | "other";

/* ============ field primitives ============ */
function HFField({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="hf-field">
      <label className="hf-field-label">
        {label}
        {required && <span className="hf-field-req">*</span>}
        {optional && <span className="hf-field-opt">optional</span>}
        {hint && <span className="hf-field-hint">{hint}</span>}
      </label>
      {children}
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
  maxLength,
  inputMode,
  pattern,
  type,
  min,
  max,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  placeholder?: string | undefined;
  mono?: boolean | undefined;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number | undefined;
  inputMode?: "numeric" | "text" | undefined;
  pattern?: string | undefined;
  type?: HTMLInputTypeAttribute | undefined;
  min?: number | undefined;
  max?: number | undefined;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint}>
      <input
        className={`hf-input ${mono ? "hf-mono-input" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        pattern={pattern}
        type={type}
        min={min}
        max={max}
      />
    </HFField>
  );
}

function HFSelectField({
  label,
  required,
  optional,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint}>
      <select
        className="hf-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </HFField>
  );
}

/* ============ type picker ============ */
const HF_TYPES: { id: AssetType; icon: IconName; name: string; desc: string }[] = [
  { id: "vehicle", icon: "car", name: "Vehicle", desc: "Cars, trucks, vans, trailers" },
  { id: "property", icon: "home", name: "Property", desc: "Homes, land, rentals & what's on them" },
  { id: "other", icon: "wrench", name: "Other", desc: "Tools, HVAC, generators, appliances" },
];

function HFTypePicker({ value, onChange }: { value: AssetType; onChange: (v: AssetType) => void }) {
  return (
    <div className="hf-aa-types" role="radiogroup" aria-label="Asset type">
      {HF_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={`hf-type-card ${value === t.id ? "selected" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span className="hf-type-radio" />
          <span className="hf-type-icon" data-cat={t.id}>
            <Icon name={t.icon} size={19} stroke={1.7} />
          </span>
          <span className="hf-type-text">
            <span className="hf-type-name">{t.name}</span>
            <span className="hf-type-desc">{t.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ============ subtype chips (within "Other") ============ */
const HF_SUBTYPES: { id: Subtype; glyph: IconName; label: string }[] = [
  { id: "lawn", glyph: "leaf", label: "Lawn equipment" },
  { id: "power-tool", glyph: "wrench", label: "Power tool" },
  { id: "appliance", glyph: "grid", label: "Appliance" },
  { id: "hvac", glyph: "home", label: "HVAC" },
  { id: "generator", glyph: "bolt", label: "Generator" },
  { id: "other", glyph: "dot", label: "Something else" },
];

function HFSubtypeChips({ value, onChange }: { value: Subtype; onChange: (v: Subtype) => void }) {
  return (
    <div className="hf-aa-chips">
      {HF_SUBTYPES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`hf-subchip ${value === s.id ? "selected" : ""}`}
          onClick={() => onChange(s.id)}
        >
          <span className="hf-subchip-glyph">
            <Icon name={s.glyph} size={13} stroke={1.8} />
          </span>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ============ photo dropzone ============ */
function HFDropzone() {
  return (
    <button className="hf-dropzone" type="button" disabled title="Photo uploads are coming soon">
      <div className="hf-dropzone-icon">
        <Icon name="camera" size={18} color="var(--hf-ink-soft)" />
      </div>
      <div className="hf-dropzone-label">Add photo</div>
      <div className="hf-dropzone-sub">coming soon</div>
    </button>
  );
}

/* ============ contextual detail sections ============ */
type SetField = <K extends keyof AddAssetFormValues>(
  field: K,
  value: AddAssetFormValues[K],
) => void;

function HFVehicleFields({ values, setField }: { values: AddAssetFormValues; setField: SetField }) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Vehicle details</span>
        <span className="hf-aa-section-hint">helps with service reminders</span>
      </div>
      <div className="hf-field-row">
        <HFTextField
          label="Make"
          required
          placeholder="Ford"
          value={values.vehicleMake}
          onChange={(value) => setField("vehicleMake", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.vehicleMake}
        />
        <HFTextField
          label="Model"
          required
          placeholder="F-150"
          value={values.vehicleModel}
          onChange={(value) => setField("vehicleModel", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.vehicleModel}
        />
        <HFTextField
          label="Year"
          required
          placeholder="2022"
          mono
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear() + 1}
          value={values.vehicleYear}
          onChange={(value) => setField("vehicleYear", value)}
        />
      </div>
      <HFTextField
        label="VIN"
        optional
        hint="enables warranty lookups"
        placeholder="1FTFW1E50NFA12345"
        mono
        value={values.vin}
        onChange={(value) => setField("vin", value.toUpperCase())}
        maxLength={ADD_ASSET_FIELD_LIMITS.vin}
        pattern="[A-HJ-NPR-Z0-9]{17}"
      />
    </div>
  );
}

function HFPropertyFields({
  values,
  setField,
}: {
  values: AddAssetFormValues;
  setField: SetField;
}) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Property details</span>
        <span className="hf-aa-section-hint">at least street, city & state</span>
      </div>
      <HFTextField
        label="Nickname"
        optional
        hint="handy when you own multiples"
        placeholder="Main house, Cabin…"
        value={values.propertyNickname}
        onChange={(value) => setField("propertyNickname", value)}
        maxLength={ADD_ASSET_FIELD_LIMITS.propertyNickname}
      />
      <HFTextField
        label="Street"
        required
        placeholder="12 Oak St, Apt 4"
        value={values.propertyStreet}
        onChange={(value) => setField("propertyStreet", value)}
        maxLength={ADD_ASSET_FIELD_LIMITS.propertyStreet}
      />
      <div className="hf-field-row">
        <HFTextField
          label="City"
          required
          placeholder="Portland"
          value={values.propertyCity}
          onChange={(value) => setField("propertyCity", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.propertyCity}
        />
        <HFSelectField
          label="State"
          required
          options={["OR", "WA", "CA", "ID", "NV", "AZ"]}
          value={values.propertyState}
          onChange={(value) => setField("propertyState", value)}
        />
        <HFTextField
          label="Postal"
          required
          placeholder="97204"
          mono
          value={values.propertyPostalCode}
          onChange={(value) => setField("propertyPostalCode", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.propertyPostalCode}
        />
      </div>
    </div>
  );
}

function HFOtherFields({
  subtype,
  onSubtype,
  values,
  setField,
}: {
  subtype: Subtype;
  onSubtype: (v: Subtype) => void;
  values: AddAssetFormValues;
  setField: SetField;
}) {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Details</span>
        <span className="hf-aa-section-hint">all optional — fill what you know</span>
      </div>
      <HFField label="What is it?" hint="picks the right service reminders">
        <HFSubtypeChips value={subtype} onChange={onSubtype} />
      </HFField>
      <div className="hf-field-row">
        <HFTextField
          label="Manufacturer"
          placeholder={
            subtype === "lawn"
              ? "Toro"
              : subtype === "hvac"
                ? "Carrier"
                : subtype === "generator"
                  ? "Generac"
                  : "Brand"
          }
          value={values.equipmentManufacturer}
          onChange={(value) => setField("equipmentManufacturer", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.equipmentManufacturer}
        />
        <HFTextField
          label="Model number"
          placeholder="MX5060"
          mono
          value={values.equipmentModelNumber}
          onChange={(value) => setField("equipmentModelNumber", value)}
          maxLength={ADD_ASSET_FIELD_LIMITS.equipmentModelNumber}
        />
      </div>
      <HFTextField
        label="Serial number"
        optional
        hint="useful for warranty"
        placeholder="SN-298471-A"
        mono
        value={values.equipmentSerialNumber}
        onChange={(value) => setField("equipmentSerialNumber", value)}
        maxLength={ADD_ASSET_FIELD_LIMITS.equipmentSerialNumber}
      />
    </div>
  );
}

/* maps current type → name placeholder + follow-up label */
function namePlaceholder(type: AssetType, subtype: Subtype): string {
  if (type === "vehicle") return "Ford F-150 · #4";
  if (type === "property") return "12 Oak St";
  if (subtype === "lawn") return "Toro ZTR Mower";
  if (subtype === "hvac") return "Rooftop AC unit";
  if (subtype === "generator") return "Generac 22kW";
  return "Pressure washer";
}

function followLabel(type: AssetType, subtype: Subtype): string {
  if (type === "vehicle") return "vehicle";
  if (type === "property") return "property";
  if (subtype === "lawn") return "equipment";
  if (subtype === "hvac") return "unit";
  return "asset";
}

/* ============ shared field-stack ============ */
function HFAddAssetFields({
  type,
  setType,
  subtype,
  setSubtype,
  values,
  setField,
  showHeaderHint,
}: {
  type: AssetType;
  setType: (v: AssetType) => void;
  subtype: Subtype;
  setSubtype: (v: Subtype) => void;
  values: AddAssetFormValues;
  setField: SetField;
  showHeaderHint?: boolean | undefined;
}) {
  return (
    <>
      {/* TYPE */}
      <div className="hf-aa-section">
        <HFField
          label="Asset type"
          required
          hint={showHeaderHint ? "three buckets — pick what fits" : undefined}
        >
          <HFTypePicker value={type} onChange={setType} />
        </HFField>
      </div>

      {/* NAME */}
      <HFTextField
        label="Asset name"
        required
        hint="how you'll recognize it"
        placeholder={namePlaceholder(type, subtype)}
        value={values.name}
        onChange={(value) => setField("name", value)}
        maxLength={ADD_ASSET_FIELD_LIMITS.name}
      />

      <div className="hf-aa-rule" />

      {/* CONTEXTUAL FIELDS */}
      {type === "vehicle" && <HFVehicleFields values={values} setField={setField} />}
      {type === "property" && <HFPropertyFields values={values} setField={setField} />}
      {type === "other" && (
        <HFOtherFields
          subtype={subtype}
          onSubtype={setSubtype}
          values={values}
          setField={setField}
        />
      )}
    </>
  );
}

/* ============ main: full-page add-asset form (responsive) ============ */
export function AppAddAsset({ initialType = "vehicle" }: { initialType?: AssetType }) {
  const [type, setType] = useState<AssetType>(initialType);
  const [subtype, setSubtype] = useState<Subtype>("lawn");
  const [values, setValues] = useState<AddAssetFormValues>(EMPTY_ADD_ASSET_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Esc cancels back to the asset library — mirrors the breadcrumb's hint.
  useEffect(() => {
    document.title = "FieldOps — Add Asset";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(paths.assets);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const cancel = () => {
    navigate(paths.assets);
  };

  const setField: SetField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await createAsset(buildCreateAssetPayload(type, values));
      navigate(paths.assets);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save asset");
      setSaving(false);
    }
  };

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

      <form id="add-asset-form" className="hf-aa-body" onSubmit={save}>
        <div className="hf-aa-col">
          <div className="hf-aa-head">
            <h1>Add an asset</h1>
            <p>
              Track anything that needs regular service — pick a type and we'll ask the right
              details.
            </p>
          </div>

          <HFAddAssetFields
            type={type}
            setType={setType}
            subtype={subtype}
            setSubtype={setSubtype}
            values={values}
            setField={setField}
            showHeaderHint
          />

          {saveError && (
            <div className="hf-aa-error" role="alert">
              {saveError}
            </div>
          )}

          <div className="hf-aa-rule" />

          {/* PHOTO */}
          <div className="hf-photo-row">
            <div className="hf-photo-text">
              <label className="hf-field-label">
                Photo <span className="hf-field-opt">optional</span>
              </label>
              <div className="hf-photo-sub">
                Photo uploads are not available yet. Saved assets use a category icon.
              </div>
            </div>
            <HFDropzone />
          </div>

          {/* NEXT STEP */}
          <div className="hf-aa-next">
            <div className="hf-aa-next-icon">
              <Icon name="calendar" size={17} stroke={1.8} />
            </div>
            <div className="hf-aa-next-text">
              <div className="hf-aa-next-title">Next: set up a service schedule</div>
              <div className="hf-aa-next-sub">
                After saving, we'll ask when this {followLabel(type, subtype)} needs its next
                service.
              </div>
            </div>
            <Icon name="arrow-right" size={18} color="var(--hf-brand-2)" />
          </div>
        </div>
      </form>

      {/* STICKY SAVE BAR */}
      <div className="hf-aa-footer">
        <div className="hf-aa-footer-note">
          Fields marked <span className="hf-field-req">*</span> are required
        </div>
        <div className="hf-aa-footer-actions">
          <button className="hf-btn hf-btn-secondary hf-btn-lg" type="button" onClick={cancel}>
            Cancel
          </button>
          <button
            className="hf-btn hf-btn-primary hf-btn-lg"
            type="submit"
            form="add-asset-form"
            disabled={saving}
          >
            <Icon name="check" size={15} stroke={2.2} />
            {saving ? "Saving..." : "Save asset"}
          </button>
        </div>
      </div>
    </div>
  );
}
