import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { addCalendarDays } from "@snaveevans/pineapple-shared";
import { ApiError } from "../api/client.ts";
import {
  rescheduleMaintenanceTask,
  type MaintenanceTask,
} from "../api/maintenanceTasks.ts";
import { Button, ButtonSpinner } from "../design/Button.tsx";
import { Field } from "../design/Field.tsx";
import { Icon } from "../design/Icon.tsx";
import { formatPreviewDueDate } from "./maintenanceTaskForm.ts";
import { paths } from "../routes.ts";

import "../design/styles/hifi-add-service.css";

export type RescheduleTaskModalProps = {
  taskId: string;
  assetId: string;
  taskTitle: string;
  currentNextDue: string;
  todayUtc: string;
  onClose: () => void;
  onSaved: (task: MaintenanceTask) => void | Promise<void>;
};

export function RescheduleTaskModal({
  taskId,
  assetId,
  taskTitle,
  currentNextDue,
  todayUtc,
  onClose,
  onSaved,
}: RescheduleTaskModalProps) {
  const navigate = useNavigate();
  const dateRef = useRef<HTMLInputElement>(null);
  const [nextDue, setNextDue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [savedTask, setSavedTask] = useState<MaintenanceTask | null>(null);

  // Server rule mirrored client-side: the target must be strictly after todayUtc.
  const minDate = addCalendarDays(todayUtc, 1);

  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: () => rescheduleMaintenanceTask(assetId, taskId, { nextDue }),
    onSuccess: async (task) => {
      setSavedTask(task);
      try {
        await onSaved(task);
      } catch {
        setBanner(
          "Due date saved, but the dashboard could not refresh. Close and reopen if the queue looks stale.",
        );
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate(paths.login(), { replace: true });
        return;
      }
      if (error instanceof ApiError && error.status === 422 && error.field === "nextDue") {
        setFieldError(error.message);
        return;
      }
      setBanner(error instanceof Error ? error.message : "Failed to reschedule task.");
    },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clearFieldError = () => {
    if (!fieldError) return;
    setFieldError(null);
  };

  const submit = () => {
    if (mutation.isPending || savedTask) return;
    if (!nextDue) {
      setFieldError("Choose a new due date.");
      return;
    }
    if (nextDue <= todayUtc) {
      setFieldError("New due date must be after today.");
      return;
    }
    setBanner(null);
    setFieldError(null);
    mutation.mutate();
  };

  const formDisabled = mutation.isPending;

  return (
    <div className="hf-svc-overlay">
      <div className="hf-svc-scrim" onClick={() => !formDisabled && onClose()} />
      <div className="hf-svc-drawer" role="dialog" aria-modal="true" aria-label="Reschedule task">
        <div className="hf-svc-head">
          <div>
            <div className="hf-svc-title">Reschedule</div>
            {!savedTask && <div className="hf-svc-sub">{taskTitle}</div>}
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
              <div className="hf-svc-done-title">Due date moved</div>
              <div className="hf-svc-done-sub">
                <strong>{savedTask.title}</strong> is now due{" "}
                <strong>{formatPreviewDueDate(savedTask.nextDue)}</strong>. No maintenance was
                logged.
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

            <Field
              label="New due date"
              htmlFor="hf-resched-date"
              required
              {...(fieldError
                ? { error: fieldError }
                : { sub: `Currently due ${formatPreviewDueDate(currentNextDue)}.` })}
            >
              <input
                id="hf-resched-date"
                ref={dateRef}
                type="date"
                min={minDate}
                className={`hf-input ${fieldError ? "is-invalid" : ""}`}
                value={nextDue}
                disabled={formDisabled}
                onChange={(event) => {
                  setNextDue(event.target.value);
                  clearFieldError();
                  if (banner) setBanner(null);
                }}
              />
            </Field>

            <p className="hf-svc-preview-txt hf-resched-note">
              Rescheduling only moves the current due date — it does not record maintenance work.
            </p>
          </div>
        )}

        <div className="hf-svc-foot">
          {savedTask ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              {/* Only the submitting action is disabled while pending (dashboard S5). */}
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={formDisabled}>
                {mutation.isPending ? (
                  <>
                    <ButtonSpinner />
                    Saving…
                  </>
                ) : (
                  <>
                    <Icon name="calendar" size={14} stroke={2.2} />
                    Reschedule
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
