import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../api/client.ts";
import {
  createMaintenanceTask,
  type MaintenanceTask,
} from "../api/maintenanceTasks.ts";
import { Icon } from "../design/Icon.tsx";
import { HFAssetIcon } from "../design/hf.tsx";
import { paths } from "../routes.ts";
import { categoryLabel, type AssetPresentation } from "./assetPresentation.ts";
import {
  EMPTY_MAINTENANCE_TASK_FORM,
  formatIntervalPhrase,
  formatPreviewDueDate,
  previewNextDueDate,
  resolveAssetId,
  TASK_TITLE_MAX,
  TASK_UNITS,
  toCreateMaintenanceTaskBody,
  validateMaintenanceTaskForm,
  type MaintenanceTaskFormErrors,
  type MaintenanceTaskFormValues,
} from "./maintenanceTaskForm.ts";

import "../design/styles/hifi-add-service.css";

type AddServiceModalProps = {
  assets: AssetPresentation[];
  defaultAssetId?: string | null;
  todayUtc: string;
  onClose: () => void;
  onSaved: (task: MaintenanceTask) => void | Promise<void>;
};

export function AddServiceModal({
  assets,
  defaultAssetId,
  todayUtc,
  onClose,
  onSaved,
}: AddServiceModalProps) {
  const navigate = useNavigate();
  const titleRef = useRef<HTMLInputElement>(null);
  const [assetId, setAssetId] = useState(() => resolveAssetId(assets, defaultAssetId));
  const [pickingAsset, setPickingAsset] = useState(false);
  const [values, setValues] = useState<MaintenanceTaskFormValues>(EMPTY_MAINTENANCE_TASK_FORM);
  const [errors, setErrors] = useState<MaintenanceTaskFormErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [savedTask, setSavedTask] = useState<MaintenanceTask | null>(null);

  const asset = useMemo(
    () => assets.find((item) => item.id === assetId) ?? null,
    [assets, assetId],
  );

  useEffect(() => {
    if (assets.some((item) => item.id === assetId)) return;
    setAssetId(resolveAssetId(assets, defaultAssetId));
  }, [assets, assetId, defaultAssetId]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: () => {
      const target = assets.find((item) => item.id === assetId);
      if (!target) throw new Error("Choose an asset before saving.");
      return createMaintenanceTask(target.id, toCreateMaintenanceTaskBody(values));
    },
    onSuccess: async (task) => {
      setSavedTask(task);
      try {
        await onSaved(task);
      } catch {
        setBanner(
          "Service saved, but the dashboard could not refresh. Close and reopen if the queue looks stale.",
        );
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate(paths.login(), { replace: true });
        return;
      }
      setBanner(error instanceof Error ? error.message : "Failed to save service.");
    },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !mutation.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mutation.isPending, onClose]);

  const nextDue = previewNextDueDate(values, todayUtc);
  const formDisabled = mutation.isPending;

  const clearError = (field: keyof MaintenanceTaskFormErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateValue = <K extends keyof MaintenanceTaskFormValues>(
    field: K,
    value: MaintenanceTaskFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearError(field as keyof MaintenanceTaskFormErrors);
    if (banner) setBanner(null);
  };

  const submit = () => {
    if (formDisabled || !asset) return;
    const nextErrors = validateMaintenanceTaskForm(values, todayUtc);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBanner(null);
    mutation.mutate();
  };

  if (!asset) return null;

  return (
    <div className="hf-svc-overlay">
      <div className="hf-svc-scrim" onClick={() => !formDisabled && onClose()} />
      <div
        className="hf-svc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Add a service"
      >
        <div className="hf-svc-head">
          <div>
            <div className="hf-svc-title">
              {savedTask ? "Service scheduled" : "Add a service"}
            </div>
            {!savedTask && (
              <div className="hf-svc-sub">Schedule recurring work for an asset.</div>
            )}
          </div>
          <button
            className="hf-icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={formDisabled}
          >
            <Icon name="x" size={16} stroke={2} />
          </button>
        </div>

        {savedTask ? (
          <div className="hf-svc-body">
            <div className="hf-svc-done">
              <div className="hf-svc-done-icon">
                <Icon name="check" size={26} stroke={2.4} />
              </div>
              <div className="hf-svc-done-title">Added to {asset.name}</div>
              <div className="hf-svc-done-sub">
                <strong>{savedTask.title}</strong> —{" "}
                {formatIntervalPhrase(savedTask.intervalValue, savedTask.intervalUnit)}.
                First service due{" "}
                <strong>{formatPreviewDueDate(savedTask.nextDue)}</strong>.
              </div>
            </div>
          </div>
        ) : (
          <div className="hf-svc-body">
            {banner && (
              <div className="hf-svc-banner" role="alert">
                <Icon name="alert" size={15} stroke={2} />
                <span>{banner}</span>
              </div>
            )}

            <div className="hf-field">
              <label className="hf-field-label">
                Asset <span className="hf-field-req">*</span>
                <span className="hf-field-hint">what needs servicing</span>
              </label>
              {pickingAsset ? (
                <div className="hf-svc-picker" role="listbox" aria-label="Choose an asset">
                  {assets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === assetId}
                      className={`hf-svc-picker-row ${item.id === assetId ? "active" : ""}`}
                      disabled={formDisabled}
                      onClick={() => {
                        setAssetId(item.id);
                        setPickingAsset(false);
                      }}
                    >
                      <HFAssetIcon asset={{ category: item.cat, icon: item.icon }} size={34} />
                      <div className="hf-svc-picker-text">
                        <div className="hf-svc-picker-name">{item.name}</div>
                        <div className="hf-svc-picker-meta">
                          {item.displayId} · {categoryLabel(item.cat)}
                        </div>
                      </div>
                      {item.id === assetId && (
                        <span className="hf-svc-picker-check">
                          <Icon name="check" size={16} stroke={2.4} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  className="hf-svc-asset"
                  disabled={formDisabled}
                  onClick={() => setPickingAsset(true)}
                >
                  <HFAssetIcon asset={{ category: asset.cat, icon: asset.icon }} size={40} />
                  <div className="hf-svc-asset-text">
                    <div className="hf-svc-asset-name">{asset.name}</div>
                    <div className="hf-svc-asset-meta">
                      <span className="hf-mono">{asset.displayId}</span>
                      <span className="hf-dot-sep" />
                      {categoryLabel(asset.cat)}
                    </div>
                  </div>
                  <span className="hf-svc-change">
                    Change
                    <Icon name="chevron-right" size={13} stroke={2.2} />
                  </span>
                </button>
              )}
            </div>

            <div className="hf-field">
              <label className="hf-field-label" htmlFor="hf-svc-title">
                Service <span className="hf-field-req">*</span>
                <span className="hf-field-hint">
                  {values.title.length}/{TASK_TITLE_MAX}
                </span>
              </label>
              <input
                id="hf-svc-title"
                ref={titleRef}
                type="text"
                className={`hf-input ${errors.title ? "is-invalid" : ""}`}
                placeholder='e.g. "Replace furnace filter"'
                maxLength={TASK_TITLE_MAX + 20}
                value={values.title}
                disabled={formDisabled}
                onChange={(event) => updateValue("title", event.target.value)}
              />
              {errors.title && (
                <span className="hf-svc-field-err">
                  <Icon name="alert" size={12} stroke={2} />
                  {errors.title}
                </span>
              )}
            </div>

            <div className="hf-field">
              <label className="hf-field-label">
                Repeat every <span className="hf-field-req">*</span>
              </label>
              <div className="hf-svc-interval">
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={`hf-input hf-mono-input hf-svc-num ${errors.intervalValue ? "is-invalid" : ""}`}
                  value={values.intervalValue}
                  disabled={formDisabled}
                  onChange={(event) => updateValue("intervalValue", event.target.value)}
                />
                <div className="hf-seg" role="group" aria-label="Interval unit">
                  {TASK_UNITS.map((unit) => (
                    <button
                      key={unit.value}
                      type="button"
                      className={`hf-seg-btn ${values.intervalUnit === unit.value ? "active" : ""}`}
                      disabled={formDisabled}
                      onClick={() => updateValue("intervalUnit", unit.value)}
                    >
                      {unit.label}
                    </button>
                  ))}
                </div>
              </div>
              {errors.intervalValue && (
                <span className="hf-svc-field-err">
                  <Icon name="alert" size={12} stroke={2} />
                  {errors.intervalValue}
                </span>
              )}
            </div>

            <div className="hf-field">
              <label className="hf-field-label" htmlFor="hf-svc-last">
                Last completed <span className="hf-field-opt">optional</span>
              </label>
              <input
                id="hf-svc-last"
                type="date"
                max={todayUtc}
                className={`hf-input ${errors.lastCompletedDate ? "is-invalid" : ""}`}
                value={values.lastCompletedDate}
                disabled={formDisabled}
                onChange={(event) => updateValue("lastCompletedDate", event.target.value)}
              />
              {errors.lastCompletedDate ? (
                <span className="hf-svc-field-err">
                  <Icon name="alert" size={12} stroke={2} />
                  {errors.lastCompletedDate}
                </span>
              ) : (
                <span className="hf-svc-hint">Leave blank to start counting from today.</span>
              )}
            </div>

            {nextDue && (
              <div className="hf-svc-preview">
                <Icon name="calendar" size={16} stroke={1.8} />
                <span className="hf-svc-preview-txt">
                  First service due <strong>{formatPreviewDueDate(nextDue)}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="hf-svc-foot">
          {savedTask ? (
            <button className="hf-btn hf-btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button
                className="hf-btn hf-btn-ghost"
                onClick={onClose}
                disabled={formDisabled}
              >
                Cancel
              </button>
              <button
                className="hf-btn hf-btn-primary"
                onClick={submit}
                disabled={formDisabled || !asset}
              >
                {mutation.isPending ? (
                  <>
                    <span className="hf-svc-spinner" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Icon name="check" size={14} stroke={2.3} />
                    Save service
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}