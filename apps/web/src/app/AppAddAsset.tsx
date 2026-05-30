import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../design/Icon";
import { HFTopBar } from "./AppChrome";

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

type AssetType = "vehicle" | "property" | "other";
type Subtype = "lawn" | "power-tool" | "appliance" | "hvac" | "generator" | "other";

const ASSETS_HREF = "/app/assets";

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
  defaultValue,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  placeholder?: string | undefined;
  mono?: boolean | undefined;
  defaultValue?: string | undefined;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint}>
      <input
        className={`hf-input ${mono ? "hf-mono-input" : ""}`}
        placeholder={placeholder}
        defaultValue={defaultValue}
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
  defaultValue,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  options: string[];
  defaultValue?: string | undefined;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint}>
      <select className="hf-select" defaultValue={defaultValue}>
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

function HFTypePicker({
  value,
  onChange,
}: {
  value: AssetType;
  onChange: (v: AssetType) => void;
}) {
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

function HFSubtypeChips({
  value,
  onChange,
}: {
  value: Subtype;
  onChange: (v: Subtype) => void;
}) {
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
    <div className="hf-dropzone">
      <div className="hf-dropzone-icon">
        <Icon name="camera" size={18} color="var(--hf-ink-soft)" />
      </div>
      <div className="hf-dropzone-label">Add photo</div>
      <div className="hf-dropzone-sub">drag or click</div>
    </div>
  );
}

/* ============ contextual detail sections ============ */
function HFVehicleFields() {
  return (
    <div className="hf-aa-section">
      <div className="hf-aa-section-head">
        <span className="hf-aa-section-title">Vehicle details</span>
        <span className="hf-aa-section-hint">helps with service reminders</span>
      </div>
      <div className="hf-field-row">
        <HFTextField label="Make" required placeholder="Ford" />
        <HFTextField label="Model" required placeholder="F-150" />
        <HFTextField label="Year" required placeholder="2022" mono />
      </div>
      <HFTextField
        label="VIN"
        optional
        hint="enables warranty lookups"
        placeholder="1FTFW1E50NFA12345"
        mono
      />
    </div>
  );
}

function HFPropertyFields() {
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
      />
      <HFTextField label="Street" required placeholder="12 Oak St, Apt 4" />
      <div className="hf-field-row">
        <HFTextField label="City" required placeholder="Portland" />
        <HFSelectField label="State" required options={["OR", "WA", "CA", "ID", "NV", "AZ"]} />
        <HFTextField label="Postal" required placeholder="97204" mono />
      </div>
    </div>
  );
}

function HFOtherFields({
  subtype,
  onSubtype,
}: {
  subtype: Subtype;
  onSubtype: (v: Subtype) => void;
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
        />
        <HFTextField label="Model number" placeholder="MX5060" mono />
      </div>
      <HFTextField label="Serial number" optional hint="useful for warranty" placeholder="SN-298471-A" mono />
      {subtype === "lawn" && (
        <div className="hf-field-row">
          <HFTextField label="Engine hours" optional hint="schedules oil changes" placeholder="124" mono />
        </div>
      )}
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
  showHeaderHint,
}: {
  type: AssetType;
  setType: (v: AssetType) => void;
  subtype: Subtype;
  setSubtype: (v: Subtype) => void;
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
      />

      <div className="hf-aa-rule" />

      {/* CONTEXTUAL FIELDS */}
      {type === "vehicle" && <HFVehicleFields />}
      {type === "property" && <HFPropertyFields />}
      {type === "other" && <HFOtherFields subtype={subtype} onSubtype={setSubtype} />}
    </>
  );
}

/* ============ main: full-page add-asset form (responsive) ============ */
export function AppAddAsset({ initialType = "vehicle" }: { initialType?: AssetType }) {
  const [type, setType] = useState<AssetType>(initialType);
  const [subtype, setSubtype] = useState<Subtype>("lawn");

  // Esc cancels back to the asset library — mirrors the breadcrumb's hint.
  useEffect(() => {
    document.title = "FieldOps — Add Asset";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.location.href = ASSETS_HREF;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cancel = () => {
    window.location.href = ASSETS_HREF;
  };

  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar activeNav="assets" />

      <div className="hf-aa-crumb">
        <a href={ASSETS_HREF}>Assets</a>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">Add asset</span>
        <span className="hf-aa-crumb-esc">
          <kbd>esc</kbd> to cancel
        </span>
      </div>

      <div className="hf-aa-body">
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
            showHeaderHint
          />

          <div className="hf-aa-rule" />

          {/* PHOTO */}
          <div className="hf-photo-row">
            <div className="hf-photo-text">
              <label className="hf-field-label">
                Photo <span className="hf-field-opt">optional</span>
              </label>
              <div className="hf-photo-sub">
                Helps you spot it in the grid. If you skip it, we'll use a category icon — you can
                add or change this anytime.
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
      </div>

      {/* STICKY SAVE BAR */}
      <div className="hf-aa-footer">
        <div className="hf-aa-footer-note">
          Fields marked <span className="hf-field-req">*</span> are required
        </div>
        <div className="hf-aa-footer-actions">
          <button className="hf-btn hf-btn-secondary hf-btn-lg" onClick={cancel}>
            Cancel
          </button>
          <button className="hf-btn hf-btn-primary hf-btn-lg">
            <Icon name="check" size={15} stroke={2.2} />
            Save asset
          </button>
        </div>
      </div>
    </div>
  );
}
