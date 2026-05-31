import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Icon, type IconName } from "../design/Icon";
import { HFTopBar } from "./AppChrome";
import { paths } from "../routes";

import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "../design/styles/hifi-add-asset.css";

type AssetType = "vehicle" | "property" | "other";
type Subtype = "lawn" | "power-tool" | "appliance" | "hvac" | "generator" | "other";

/* ============ form model ============ */
const EMPTY_FORM = {
  name: "",
  make: "", model: "", year: "", vin: "",
  nickname: "", street: "", city: "", state: "OR", postal: "", country: "United States",
  manufacturer: "", modelNumber: "", serialNumber: "", engineHours: "",
};

type Form = typeof EMPTY_FORM;
type Errors = Partial<Record<keyof Form, string>>;

/* Validates against the Pineapple API CreateAssetBody schema */
function validateAsset(type: AssetType, form: Form): Errors {
  const e: Errors = {};
  const has = (v: string) => v.trim().length > 0;

  if (!has(form.name)) e.name = "Required — give this asset a name.";

  if (type === "vehicle") {
    if (!has(form.make)) e.make = "Required.";
    if (!has(form.model)) e.model = "Required.";
    if (!has(form.year)) {
      e.year = "Required.";
    } else if (!/^\d+$/.test(form.year.trim())) {
      e.year = "Must be a whole number.";
    } else if (parseInt(form.year, 10) < 1900) {
      e.year = "Must be 1900 or later.";
    }
    const vin = form.vin.trim();
    if (vin && vin.length !== 17) {
      e.vin = `VIN must be exactly 17 characters (${vin.length} entered).`;
    }
  } else if (type === "property") {
    if (!has(form.street)) e.street = "Required.";
    if (!has(form.city)) e.city = "Required.";
    if (!has(form.state)) e.state = "Required.";
    if (!has(form.postal)) e.postal = "Required.";
    if (!has(form.country)) e.country = "Required.";
  }

  return e;
}

function useAddAssetForm(type: AssetType) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<null | "error" | "ok">(null);

  const setField =
    (key: keyof Form) => (ev: { target: HTMLInputElement | HTMLSelectElement }) => {
      const v = ev.target.value;
      setForm((f: Form) => ({ ...f, [key]: v }));
      setErrors((er: Errors) => {
        if (!er[key]) return er;
        const next = { ...er };
        delete next[key];
        return next;
      });
    };

  const clearValidation = () => {
    setErrors({});
    setStatus(null);
  };

  const save = (scrollEl?: HTMLElement | null) => {
    const errs = validateAsset(type, form);
    setErrors(errs);
    const count = Object.keys(errs).length;
    setStatus(count ? "error" : "ok");
    setTimeout(() => {
      if (count) {
        const el = (scrollEl || document).querySelector<HTMLElement>(
          ".hf-input.is-invalid, .hf-select.is-invalid",
        );
        el?.focus();
      } else if (scrollEl) {
        scrollEl.scrollTop = 0;
      }
    }, 0);
  };

  return { form, errors, status, errorCount: Object.keys(errors).length, setField, save, clearValidation };
}

/* ============ field primitives ============ */
type SetField = (key: keyof Form) => (ev: { target: HTMLInputElement | HTMLSelectElement }) => void;

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
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search" | undefined;
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
  optional,
  hint,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  required?: boolean | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  options: string[];
  value: string;
  onChange: (ev: { target: HTMLSelectElement }) => void;
  error?: string | undefined;
}) {
  return (
    <HFField label={label} required={required} optional={optional} hint={hint} error={error}>
      <select
        className={`hf-select${error ? " is-invalid" : ""}`}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
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

/* ============ validation summary banner ============ */
function HFValidationBanner({ status, count }: { status: null | "error" | "ok"; count: number }) {
  if (status === "error") {
    return (
      <div className="hf-aa-banner is-error" role="alert">
        <span className="hf-aa-banner-icon">
          <Icon name="alert" size={15} stroke={2} />
        </span>
        <div className="hf-aa-banner-text">
          <div className="hf-aa-banner-title">
            {count === 1 ? "1 field needs attention" : `${count} fields need attention`}
          </div>
          <div className="hf-aa-banner-sub">Fix the highlighted fields below, then save again.</div>
        </div>
      </div>
    );
  }
  if (status === "ok") {
    return (
      <div className="hf-aa-banner is-ok" role="status">
        <span className="hf-aa-banner-icon">
          <Icon name="check" size={15} stroke={2.4} />
        </span>
        <div className="hf-aa-banner-text">
          <div className="hf-aa-banner-title">Looks good</div>
          <div className="hf-aa-banner-sub">Everything checks out — this asset is ready to save.</div>
        </div>
      </div>
    );
  }
  return null;
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
          className={`hf-type-card${value === t.id ? " selected" : ""}`}
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
          className={`hf-subchip${value === s.id ? " selected" : ""}`}
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
function HFVehicleFields({
  form,
  errors,
  setField,
}: {
  form: Form;
  errors: Errors;
  setField: SetField;
}) {
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
          hint="1900 or later"
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
  form: Form;
  errors: Errors;
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
        hint="handy when you own multiples"
        placeholder="Main house, Cabin…"
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
          inputMode="numeric"
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

function HFOtherFields({
  subtype,
  onSubtype,
  form,
  setField,
}: {
  subtype: Subtype;
  onSubtype: (v: Subtype) => void;
  form: Form;
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
          value={form.manufacturer}
          onChange={setField("manufacturer")}
        />
        <HFTextField
          label="Model number"
          placeholder="MX5060"
          mono
          value={form.modelNumber}
          onChange={setField("modelNumber")}
        />
      </div>
      <HFTextField
        label="Serial number"
        optional
        hint="useful for warranty"
        placeholder="EAMT-1234567"
        mono
        value={form.serialNumber}
        onChange={setField("serialNumber")}
      />
      {subtype === "lawn" && (
        <div className="hf-field-row">
          <HFTextField
            label="Engine hours"
            optional
            hint="schedules oil changes"
            placeholder="124"
            mono
            inputMode="numeric"
            value={form.engineHours}
            onChange={setField("engineHours")}
          />
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
  form,
  errors,
  setField,
  showHeaderHint,
}: {
  type: AssetType;
  setType: (v: AssetType) => void;
  subtype: Subtype;
  setSubtype: (v: Subtype) => void;
  form: Form;
  errors: Errors;
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
        value={form.name}
        onChange={setField("name")}
        error={errors.name}
      />

      <div className="hf-aa-rule" />

      {/* CONTEXTUAL FIELDS */}
      {type === "vehicle" && <HFVehicleFields form={form} errors={errors} setField={setField} />}
      {type === "property" && <HFPropertyFields form={form} errors={errors} setField={setField} />}
      {type === "other" && (
        <HFOtherFields subtype={subtype} onSubtype={setSubtype} form={form} setField={setField} />
      )}
    </>
  );
}

/* ============ main: full-page add-asset form ============ */
export function AppAddAsset({ initialType = "vehicle" }: { initialType?: AssetType }) {
  const [type, setTypeRaw] = useState<AssetType>(initialType);
  const [subtype, setSubtype] = useState<Subtype>("lawn");
  const { form, errors, status, errorCount, setField, save, clearValidation } =
    useAddAssetForm(type);
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLDivElement>(null);

  const setType = (t: AssetType) => {
    setTypeRaw(t);
    clearValidation();
  };

  useEffect(() => {
    document.title = "FieldOps — Add Asset";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(paths.assets);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const cancel = () => navigate(paths.assets);

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
            <p>
              Track anything that needs regular service — pick a type and we'll ask the right
              details.
            </p>
          </div>

          <HFValidationBanner status={status} count={errorCount} />

          <HFAddAssetFields
            type={type}
            setType={setType}
            subtype={subtype}
            setSubtype={setSubtype}
            form={form}
            errors={errors}
            setField={setField}
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
          {status === "error" ? (
            <span className="hf-aa-footer-err">
              <Icon name="alert" size={13} stroke={2} />
              {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`}
            </span>
          ) : (
            <>
              Fields marked <span className="hf-field-req">*</span> are required
            </>
          )}
        </div>
        <div className="hf-aa-footer-actions">
          <button className="hf-btn hf-btn-secondary hf-btn-lg" onClick={cancel}>
            Cancel
          </button>
          <button
            className="hf-btn hf-btn-primary hf-btn-lg"
            onClick={() => save(bodyRef.current)}
          >
            <Icon name="check" size={15} stroke={2.2} />
            Save asset
          </button>
        </div>
      </div>
    </div>
  );
}
