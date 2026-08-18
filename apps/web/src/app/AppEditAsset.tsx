import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  assetQueryKey,
  assetsQueryKey,
  editAsset,
  getAsset,
  type AssetType,
} from "../api/assets";
import { ApiError } from "../api/client";
import { Button } from "../design/Button";
import { Field, FieldReqMark, FieldRow } from "../design/Field";
import { Icon } from "../design/Icon";
import { paths } from "../routes";
import { HFTopBar } from "./AppChrome";
import {
  EMPTY_ASSET_FORM,
  assetToForm,
  toAssetFormError,
  toEditAssetBody,
  validateAssetForm,
  type AssetForm,
  type AssetFormErrors,
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

function HFTextField({
  label,
  required,
  value,
  onChange,
  error,
  mono,
  maxLength,
  inputMode,
  hint,
  optional,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (ev: { target: HTMLInputElement }) => void;
  error?: string;
  mono?: boolean;
  maxLength?: number;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  hint?: string;
  optional?: boolean;
  placeholder?: string;
}) {
  return (
    <Field
      label={label}
      {...(required ? { required: true } : {})}
      {...(optional ? { optional: true } : {})}
      {...(hint !== undefined ? { hint } : {})}
      {...(error ? { error } : {})}
    >
      <input
        className={`hf-input${mono ? " hf-mono-input" : ""}${error ? " is-invalid" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </Field>
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
  required?: boolean;
  options: string[];
  value: string;
  onChange: (ev: { target: HTMLSelectElement }) => void;
  error?: string;
}) {
  return (
    <Field label={label} {...(required ? { required: true } : {})} {...(error ? { error } : {})}>
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
    </Field>
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

const HF_TYPE_LABEL: Record<AssetType, string> = {
  vehicle: "Vehicle",
  property: "Property",
  equipment: "Equipment",
};

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
      <FieldRow>
        <HFTextField
          label="Make"
          required
          placeholder="Ford"
          value={form.make}
          onChange={setField("make")}
          {...(errors.make ? { error: errors.make } : {})}
        />
        <HFTextField
          label="Model"
          required
          placeholder="F-150"
          value={form.model}
          onChange={setField("model")}
          {...(errors.model ? { error: errors.model } : {})}
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
          {...(errors.year ? { error: errors.year } : {})}
        />
      </FieldRow>
      <HFTextField
        label="VIN"
        optional
        hint="17 characters"
        placeholder="1C6RR7LT4GS123456"
        mono
        maxLength={17}
        value={form.vin}
        onChange={setField("vin")}
        {...(errors.vin ? { error: errors.vin } : {})}
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
        {...(errors.street ? { error: errors.street } : {})}
      />
      <FieldRow>
        <HFTextField
          label="City"
          required
          placeholder="Portland"
          value={form.city}
          onChange={setField("city")}
          {...(errors.city ? { error: errors.city } : {})}
        />
        <HFTextField
          label="State"
          required
          placeholder="OR, BC, Jalisco"
          value={form.state}
          onChange={setField("state")}
          {...(errors.state ? { error: errors.state } : {})}
        />
        <HFTextField
          label="Postal"
          required
          placeholder="97204"
          mono
          value={form.postal}
          onChange={setField("postal")}
          {...(errors.postal ? { error: errors.postal } : {})}
        />
      </FieldRow>
      <HFSelectField
        label="Country"
        required
        options={["United States", "Canada", "Mexico"]}
        value={form.country}
        onChange={setField("country")}
        {...(errors.country ? { error: errors.country } : {})}
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
      <FieldRow>
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
      </FieldRow>
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

function EditAssetLoading() {
  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />
      <div className="hf-aa-body">
        <div className="hf-aa-col">
          <p>Loading asset…</p>
        </div>
      </div>
    </div>
  );
}

function EditAssetErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />
      <div className="hf-aa-body">
        <div className="hf-aa-col">
          <HFValidationBanner title={title} description={description} />
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppEditAsset() {
  const { assetId = "" } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<AssetForm>(EMPTY_ASSET_FORM);
  const [errors, setErrors] = useState<AssetFormErrors>({});
  const [banner, setBanner] = useState<{ title: string; description: string } | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const assetQuery = useQuery({
    queryKey: assetQueryKey(assetId),
    queryFn: () => getAsset(assetId),
    enabled: !!assetId,
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) &&
      count < 2,
  });

  useEffect(() => {
    if (assetQuery.error instanceof ApiError && assetQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [assetQuery.error, navigate]);

  useEffect(() => {
    if (assetQuery.data && !prefilled) {
      setForm(assetToForm(assetQuery.data));
      setPrefilled(true);
    }
  }, [assetQuery.data, prefilled]);

  const type = assetQuery.data?.type ?? "vehicle";

  const returnToDetail = () => navigate(paths.assetMaintenance(assetId));

  const mutation = useMutation({
    mutationFn: () => editAsset(assetId, toEditAssetBody(type, form)),
    onSuccess: async (updated) => {
      queryClient.setQueryData(assetQueryKey(assetId), updated);
      await queryClient.invalidateQueries({ queryKey: assetsQueryKey });
      returnToDetail();
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
    mutation.mutate();
  };

  useEffect(() => {
    document.title = "FieldOps - Edit Asset";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") returnToDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assetId]);

  if (assetQuery.isPending) {
    return <EditAssetLoading />;
  }

  if (assetQuery.error instanceof ApiError) {
    if (assetQuery.error.status === 403) {
      return (
        <EditAssetErrorState
          title="Access denied"
          description="This asset belongs to another account, or you don't have permission to edit it."
        />
      );
    }
    if (assetQuery.error.status === 404) {
      return (
        <EditAssetErrorState
          title="Asset not found"
          description="We couldn't find this asset. It may have been removed."
        />
      );
    }
    if (assetQuery.error.status !== 401) {
      return (
        <EditAssetErrorState
          title="Couldn't load asset"
          description="Something went wrong fetching this asset."
          onRetry={() => void assetQuery.refetch()}
        />
      );
    }
    // 401 falls through to the loading state below while the redirect effect fires.
  }

  if (!assetQuery.data || !prefilled) {
    return <EditAssetLoading />;
  }

  if (!assetQuery.data.sharing.isOwner) {
    return (
      <EditAssetErrorState
        title="Access denied"
        description="Only the asset's owner can edit it."
      />
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />

      <div className="hf-aa-crumb">
        <Link to={paths.assetMaintenance(assetId)}>{form.name || "Asset"}</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">Edit asset</span>
        <span className="hf-aa-crumb-esc">
          <kbd>esc</kbd> to cancel
        </span>
      </div>

      <div className="hf-aa-body" ref={bodyRef}>
        <div className="hf-aa-col">
          <div className="hf-aa-head">
            <h1>Edit asset</h1>
            <p>Update the name and details for this {HF_TYPE_LABEL[type].toLowerCase()}.</p>
          </div>

          {banner && <HFValidationBanner title={banner.title} description={banner.description} />}

          <div className="hf-aa-section">
            <Field label="Asset type">
              <span className="hf-type-readonly">{HF_TYPE_LABEL[type]}</span>
            </Field>
          </div>

          <HFTextField
            label="Asset name"
            required
            value={form.name}
            onChange={setField("name")}
            {...(errors.name ? { error: errors.name } : {})}
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
              Fields marked <FieldReqMark /> are required
            </>
          )}
        </div>
        <div className="hf-aa-footer-actions">
          <Button variant="secondary" size="lg" onClick={returnToDetail}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={save} disabled={mutation.isPending}>
            <Icon name="check" size={15} stroke={2.2} />
            {mutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
