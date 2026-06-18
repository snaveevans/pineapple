import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client.ts";
import { getAsset, assetQueryKey } from "../api/assets.ts";
import {
  listMaintenanceRecords,
  createMaintenanceRecord,
  maintenanceRecordsQueryKey,
  type MaintenanceRecord,
  type MaintenanceRecordListResponse,
} from "../api/maintenanceRecords.ts";
import {
  listMaintenanceTasks,
  createMaintenanceTask,
  deleteMaintenanceTask,
  maintenanceTasksQueryKey,
  type MaintenanceTask,
  type CreateMaintenanceTaskBody,
} from "../api/maintenanceTasks.ts";
import { Icon } from "../design/Icon.tsx";
import { HFAssetIcon } from "../design/hf.tsx";
import { HFTopBar, HFBottomNav } from "./AppChrome.tsx";
import { toAssetPresentation, type AssetPresentation } from "./assetPresentation.ts";
import {
  EMPTY_MAINTENANCE_TASK_FORM,
  TASK_TITLE_MAX,
  TASK_UNITS,
  todayDateOnly,
  toCreateMaintenanceTaskBody,
  validateMaintenanceTaskForm,
  type MaintenanceTaskFormValues,
} from "./maintenanceTaskForm.ts";
import { paths } from "../routes.ts";

import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "../design/styles/mr.css";

// ─── date helpers ────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ymdToUTC(s: string): number {
  const parts = s.split("-").map(Number);
  return Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!);
}

function fmtDate(s: string): string {
  const parts = s.split("-").map(Number);
  return `${MONTHS_SHORT[parts[1]! - 1]} ${parts[2]}, ${s.slice(0, 4)}`;
}

function relAgo(s: string): string {
  const n = Math.round((ymdToUTC(todayDateOnly()) - ymdToUTC(s)) / 86400000);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n} days ago`;
  if (n < 14) return "1 week ago";
  if (n < 31) return `${Math.round(n / 7)} weeks ago`;
  const mo = Math.round(n / 30.4);
  if (mo <= 1) return "1 month ago";
  if (mo < 12) return `${mo} months ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} ${yr > 1 ? "years" : "year"} ago`;
}

// ─── task helpers (presentation only — status/daysDue come from the API) ─────

function fmtInterval(value: number, unit: string): string {
  return value === 1 ? `Every ${unit}` : `Every ${value} ${unit}s`;
}

function nextDueLabel(daysDue: number, nextDue: string): string {
  if (daysDue < 0) {
    const overdueDays = -daysDue;
    return overdueDays === 1 ? "Overdue · 1 day" : `Overdue · ${overdueDays} days`;
  }
  if (daysDue === 0) return "Due today";
  if (daysDue === 1) return "Due tomorrow";
  if (daysDue <= 14) return `Due in ${daysDue} days`;
  const parts = nextDue.split("-").map(Number);
  const y = parts[0]!, m = parts[1]!, d = parts[2]!;
  const todayY = Number(todayDateOnly().slice(0, 4));
  if (y === todayY) return `Due ${MONTHS_SHORT[m - 1]} ${d}`;
  return `Due ${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

type GroupedRecord = MaintenanceRecord & { sameDay: boolean };
type YearGroup = { year: string; items: GroupedRecord[] };

function sortRecords(records: MaintenanceRecord[]): MaintenanceRecord[] {
  return [...records].sort((a, b) => {
    if (a.performedAt !== b.performedAt) return a.performedAt < b.performedAt ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

function groupByYear(sorted: MaintenanceRecord[]): YearGroup[] {
  const groups: YearGroup[] = [];
  let cur: YearGroup | null = null;
  sorted.forEach((r, i) => {
    const yr = r.performedAt.slice(0, 4);
    if (!cur || cur.year !== yr) {
      cur = { year: yr, items: [] };
      groups.push(cur);
    }
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const sameDay =
      (prev?.performedAt === r.performedAt) || (next?.performedAt === r.performedAt);
    cur.items.push({ ...r, sameDay });
  });
  return groups;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function MRTimeline({ groups }: { groups: YearGroup[] }) {
  return (
    <div className="mr-tl">
      {groups.map((g) => (
        <div className="mr-tl-group" key={g.year}>
          <div className="mr-tl-year">
            <span>{g.year}</span>
            <span className="mr-tl-year-line" />
          </div>
          {g.items.map((r) => (
            <div className="mr-tl-item" key={r.id}>
              <div className="mr-tl-aside">
                <div className="mr-tl-date">{fmtDate(r.performedAt)}</div>
                <div className="mr-tl-ago">{relAgo(r.performedAt)}</div>
              </div>
              <div className="mr-tl-rail">
                <span className="mr-tl-dot" />
                <span className="mr-tl-line" />
              </div>
              <div className="mr-tl-body">
                <div className="mr-tl-date-inline">
                  {fmtDate(r.performedAt)}
                  <span className="mr-tl-ago-inline">· {relAgo(r.performedAt)}</span>
                  {r.sameDay && <span className="mr-tl-sameday">same day</span>}
                </div>
                <div className="mr-tl-title">
                  {r.title}
                  {r.sameDay && <span className="mr-tl-sameday mr-tl-sameday-wide">same day</span>}
                </div>
                {r.notes && <p className="mr-tl-notes">{r.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MRTable({ groups }: { groups: YearGroup[] }) {
  return (
    <div className="mr-table" role="table">
      <div className="mr-thead" role="row">
        <span className="mr-th mr-th-date" role="columnheader">Performed</span>
        <span className="mr-th mr-th-work" role="columnheader">Work performed</span>
        <span className="mr-th mr-th-notes" role="columnheader">Notes</span>
        <span className="mr-th mr-th-logged" role="columnheader">Logged</span>
      </div>
      {groups.map((g) => (
        <div className="mr-tbody" key={g.year} role="rowgroup">
          <div className="mr-trow-year" role="row"><span>{g.year}</span></div>
          {g.items.map((r) => (
            <div className="mr-trow" role="row" key={r.id}>
              <span className="mr-td mr-td-date" role="cell">
                <span className="mr-td-date-main">{fmtDate(r.performedAt)}</span>
                <span className="mr-td-date-ago">{relAgo(r.performedAt)}</span>
              </span>
              <span className="mr-td mr-td-work" role="cell">
                {r.title}
                {r.sameDay && <span className="mr-tl-sameday">same day</span>}
              </span>
              <span className="mr-td mr-td-notes" role="cell">
                {r.notes || <span className="mr-td-dim">—</span>}
              </span>
              <span className="mr-td mr-td-logged" role="cell">
                {relAgo(r.createdAt.slice(0, 10))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MRLoading({ density }: { density: "timeline" | "table" }) {
  const rows = [0, 1, 2, 3, 4];
  if (density === "table") {
    return (
      <div className="mr-skel-table" aria-busy="true" aria-label="Loading maintenance history">
        {rows.map((i) => (
          <div className="mr-skel-trow" key={i}>
            <span className="mr-skel mr-skel-w90" />
            <span className="mr-skel mr-skel-w70" />
            <span className="mr-skel mr-skel-w80" />
            <span className="mr-skel mr-skel-w50" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mr-skel-tl" aria-busy="true" aria-label="Loading maintenance history">
      {rows.map((i) => (
        <div className="mr-skel-item" key={i}>
          <span className="mr-skel-dot" />
          <div className="mr-skel-lines">
            <span className="mr-skel mr-skel-w40" />
            <span className="mr-skel mr-skel-w75" />
            <span className="mr-skel mr-skel-block" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MREmpty({ assetName, onAdd }: { assetName: string; onAdd: () => void }) {
  return (
    <div className="mr-empty">
      <div className="mr-empty-art">
        <Icon name="wrench" size={30} color="var(--hf-brand-2)" stroke={1.7} />
      </div>
      <div className="mr-empty-title">No maintenance logged yet</div>
      <div className="mr-empty-sub">
        Record work you've done on {assetName} so you can answer "when did I last…?" later.
      </div>
      <button className="mr-btn mr-btn-primary" onClick={onAdd}>
        <Icon name="plus" size={16} stroke={2.2} />Add the first record
      </button>
    </div>
  );
}

const ERROR_CONFIG = {
  error: {
    icon: "alert" as const,
    title: "Couldn't load history",
    sub: "Something went wrong fetching maintenance records.",
    retry: true,
  },
  forbidden: {
    icon: "alert" as const,
    title: "Access denied",
    sub: "This asset belongs to another account. You don't have permission to view its maintenance history.",
    retry: false,
  },
  notfound: {
    icon: "search" as const,
    title: "Asset not found",
    sub: "We couldn't find this asset. It may have been removed.",
    retry: false,
  },
};

function MRErrorState({
  kind,
  onRetry,
}: {
  kind: "error" | "forbidden" | "notfound";
  onRetry?: () => void;
}) {
  const cfg = ERROR_CONFIG[kind];
  return (
    <div className={`mr-error mr-error-${kind}`}>
      <div className="mr-error-art">
        <Icon name={cfg.icon} size={26} stroke={1.9} />
      </div>
      <div className="mr-error-title">{cfg.title}</div>
      <div className="mr-error-sub">{cfg.sub}</div>
      {cfg.retry && onRetry && (
        <button className="mr-btn mr-btn-secondary" onClick={onRetry}>
          <Icon name="repeat" size={14} stroke={2} />Try again
        </button>
      )}
    </div>
  );
}

// ─── Overview / Schedule / Recent (ported & adapted from design) ─────────────

function MRHealthSummary({ tasks }: { tasks: MaintenanceTask[] }) {
  const overdue = tasks.filter((tk) => tk.status === "overdue").length;
  const soon = tasks.filter((tk) => tk.status === "soon").length;
  const ok = tasks.filter((tk) => tk.status === "ok").length;
  if (tasks.length === 0) return null;
  return (
    <div className="mr-health-row" role="status" aria-label="Task health summary">
      {overdue > 0 && (
        <div className="mr-health-chip mr-health-chip-overdue">
          <span className="mr-health-chip-dot" />
          <span className="mr-health-chip-val">{overdue}</span>
          <span className="mr-health-chip-lbl">{overdue === 1 ? "task overdue" : "tasks overdue"}</span>
        </div>
      )}
      {soon > 0 && (
        <div className="mr-health-chip mr-health-chip-soon">
          <span className="mr-health-chip-dot" />
          <span className="mr-health-chip-val">{soon}</span>
          <span className="mr-health-chip-lbl">{soon === 1 ? "due soon" : "due soon"}</span>
        </div>
      )}
      {ok > 0 && (
        <div className="mr-health-chip mr-health-chip-ok">
          <span className="mr-health-chip-dot" />
          <span className="mr-health-chip-val">{ok}</span>
          <span className="mr-health-chip-lbl">on schedule</span>
        </div>
      )}
    </div>
  );
}

function MRRecentActivity({ records, onViewAll }: { records: MaintenanceRecord[]; onViewAll: () => void }) {
  const recent = [...records].slice(0, 3);
  return (
    <div className="mr-recent">
      <div className="mr-recent-head">
        <span className="mr-hist-title">Recent activity</span>
        <button className="mr-recent-viewall" onClick={onViewAll}>
          View all <Icon name="chevron-right" size={13} stroke={2.2} />
        </button>
      </div>
      {recent.length === 0 ? (
        <div className="mr-recent-nil">
          <Icon name="clock-sm" size={15} color="var(--hf-ink-faint)" stroke={1.6} />
          No records yet — log maintenance from the button above.
        </div>
      ) : (
        <div className="mr-recent-list">
          {recent.map((r) => (
            <div className="mr-recent-row" key={r.id}>
              <div className="mr-recent-dot-col">
                <span className="mr-recent-dot" />
                <span className="mr-recent-line" />
              </div>
              <div className="mr-recent-body">
                <div className="mr-recent-title-row">
                  <span className="mr-recent-title">{r.title}</span>
                  {r.taskId && (
                    <span className="mr-tl-task-badge">
                      <Icon name="calendar" size={11} stroke={2} />Scheduled
                    </span>
                  )}
                </div>
                <div className="mr-recent-meta">
                  {fmtDate(r.performedAt)}
                  <span className="mr-recent-sep">·</span>
                  <span className="mr-recent-ago">{relAgo(r.performedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MRTaskCard({ task, onLog, onDelete }: { task: MaintenanceTask; onLog: (id: string) => void; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const s = task.status;
  return (
    <div className="mr-task-card" data-status={s}>
      <div className="mr-task-card-main">
        <span className="mr-task-dot" data-status={s} />
        <div className="mr-task-info">
          <div className="mr-task-title">{task.title}</div>
          <div className="mr-task-interval">{fmtInterval(task.intervalValue, task.intervalUnit)}</div>
        </div>
      </div>
      <div className="mr-task-card-right">
        <span className={`mr-due-badge mr-due-badge-${s}`}>
          <Icon name={s === "overdue" ? "alert" : s === "soon" ? "clock-sm" : "check"} size={11} stroke={2} />
          {nextDueLabel(task.daysDue, task.nextDue)}
        </span>
        {confirming ? (
          <div className="mr-task-confirm">
            <span className="mr-task-confirm-txt">Delete task?</span>
            <button className="mr-btn mr-task-confirm-yes" onClick={() => { onDelete(task.id); setConfirming(false); }}>Delete</button>
            <button className="mr-btn mr-btn-ghost mr-task-confirm-no" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <div className="mr-task-actions">
            <button className="mr-btn mr-btn-primary mr-task-log-btn" onClick={() => onLog(task.id)}>
              <Icon name="check" size={13} stroke={2.3} />Log
            </button>
            <button className="mr-task-del-btn" onClick={() => setConfirming(true)} aria-label="Delete task">
              <Icon name="x" size={14} stroke={2.1} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MRTaskEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mr-task-empty">
      <Icon name="calendar" size={18} color="var(--hf-ink-faint)" stroke={1.6} />
      <span>No scheduled tasks — <button className="mr-task-empty-link" onClick={onAdd}>add one</button> to track recurring work.</span>
    </div>
  );
}

function MRTaskLoading() {
  return (
    <div className="mr-task-skel" aria-busy="true" aria-label="Loading tasks">
      {[0, 1, 2].map((i) => (
        <div className="mr-task-skel-row" key={i}>
          <span className="mr-skel-dot" />
          <span className="mr-skel mr-skel-w70" style={{ height: 13 }} />
          <span className="mr-skel" style={{ width: 90, height: 22, borderRadius: 999 }} />
          <span className="mr-skel" style={{ width: 54, height: 30, borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}

function MRScheduleSection({
  tasks,
  isLoading,
  onLog,
  onDelete,
  onAdd,
}: {
  tasks: MaintenanceTask[];
  isLoading: boolean;
  onLog: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const sorted = [...tasks].sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
  const overdueCount = sorted.filter((t) => t.status === "overdue").length;
  return (
    <div className="mr-schedule">
      <div className="mr-schedule-head">
        <div className="mr-schedule-head-left">
          <span className="mr-hist-title">Schedule</span>
          {overdueCount > 0 ? (
            <span className="mr-due-badge mr-due-badge-overdue">{overdueCount} overdue</span>
          ) : (
            <span className="mr-hist-meta">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
          )}
        </div>
        <button className="mr-btn mr-btn-secondary mr-schedule-add-btn" onClick={onAdd}>
          <Icon name="plus" size={14} stroke={2.2} />Add task
        </button>
      </div>
      {isLoading && <MRTaskLoading />}
      {!isLoading && sorted.length === 0 && <MRTaskEmpty onAdd={onAdd} />}
      {!isLoading && sorted.length > 0 && (
        <div className="mr-task-list">
          {sorted.map((t) => (
            <MRTaskCard key={t.id} task={t} onLog={onLog} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function MROverviewTab({
  tasks,
  records,
  tasksLoading,
  onLogFromTask,
  onDeleteTask,
  onAddTask,
  onViewAll,
}: {
  tasks: MaintenanceTask[];
  records: MaintenanceRecord[];
  tasksLoading: boolean;
  onLogFromTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: () => void;
  onViewAll: () => void;
}) {
  return (
    <div className="mr-overview">
      <MRHealthSummary tasks={tasks} />
      <MRScheduleSection
        tasks={tasks}
        isLoading={tasksLoading}
        onLog={onLogFromTask}
        onDelete={onDeleteTask}
        onAdd={onAddTask}
      />
      <MRRecentActivity records={records} onViewAll={onViewAll} />
    </div>
  );
}

// ─── Task create form (simple drawer/sheet version) ──────────────────────────

interface MRCreateTaskFormProps {
  asset: AssetPresentation;
  variant: "drawer" | "sheet";
  onClose: () => void;
  onCreated: (task: MaintenanceTask) => void;
}

function MRCreateTaskForm({ asset, variant, onClose, onCreated }: MRCreateTaskFormProps) {
  const [values, setValues] = useState<MaintenanceTaskFormValues>(EMPTY_MAINTENANCE_TASK_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const mutation = useMutation({
    mutationFn: (body: CreateMaintenanceTaskBody) => createMaintenanceTask(asset.id, body),
    onSuccess: (task) => onCreated(task),
    onError: (err) => setBanner(err instanceof Error ? err.message : "Failed to save task."),
  });

  const submit = () => {
    if (mutation.isPending) return;
    const nextErrors = validateMaintenanceTaskForm(values);
    const mappedErrors: Record<string, string> = {};
    if (nextErrors.title) mappedErrors.title = nextErrors.title;
    if (nextErrors.intervalValue) mappedErrors.iv = nextErrors.intervalValue;
    if (nextErrors.lastCompletedDate) mappedErrors.last = nextErrors.lastCompletedDate;
    setErrors(mappedErrors);
    if (Object.keys(mappedErrors).length) {
      setBanner("Please fix the highlighted fields before saving.");
      return;
    }
    setBanner(null);
    mutation.mutate(toCreateMaintenanceTaskBody(values));
  };

  const clear = (field: string) =>
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const updateValue = <K extends keyof MaintenanceTaskFormValues>(
    field: K,
    value: MaintenanceTaskFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    const errorKey =
      field === "intervalValue" ? "iv" : field === "lastCompletedDate" ? "last" : field;
    clear(errorKey);
    if (banner) setBanner(null);
  };

  return (
    <div className={`mr-form mr-form-${variant}`}>
      {variant === "sheet" && <div className="mr-sheet-grab" />}
      <div className="mr-form-head">
        <div className="mr-form-head-txt">
          <div className="mr-form-title">Add scheduled task</div>
          <div className="mr-form-sub">{asset.name}</div>
        </div>
        <button className="mr-form-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={15} stroke={2.2} />
        </button>
      </div>
      <div className="mr-form-body">
        {banner && (
          <div className="mr-banner" role="alert">
            <Icon name="alert" size={15} stroke={2} /><span>{banner}</span>
          </div>
        )}
        <div className="mr-field">
          <div className="mr-field-top">
            <label className="mr-field-label" htmlFor="mt-title">Title <span className="mr-req">*</span></label>
            <span className={`mr-field-count ${values.title.length > TASK_TITLE_MAX ? "over" : ""}`}>{values.title.length}/{TASK_TITLE_MAX}</span>
          </div>
          <input id="mt-title" ref={titleRef} type="text" className={`mr-input ${errors.title ? "err" : ""}`}
            placeholder='e.g. "Replace furnace filter"' maxLength={TASK_TITLE_MAX + 20}
            value={values.title} onChange={(e) => updateValue("title", e.target.value)} />
          {errors.title && <div className="mr-field-err"><Icon name="alert" size={13} stroke={2} />{errors.title}</div>}
        </div>
        <div className="mr-field">
          <div className="mr-field-top">
            <label className="mr-field-label">Repeat every <span className="mr-req">*</span></label>
          </div>
          <div className="mr-interval-row">
            <input id="mt-iv" type="number" min="1" step="1" className={`mr-input mr-interval-num ${errors.iv ? "err" : ""}`}
              value={values.intervalValue} onChange={(e) => updateValue("intervalValue", e.target.value)} />
            <div className="mr-unit-seg" role="group" aria-label="Interval unit">
              {TASK_UNITS.map((u) => (
                <button key={u.value} type="button" className={`mr-unit-btn ${values.intervalUnit === u.value ? "active" : ""}`}
                  onClick={() => updateValue("intervalUnit", u.value)}>{u.label}</button>
              ))}
            </div>
          </div>
          {errors.iv && <div className="mr-field-err"><Icon name="alert" size={13} stroke={2} />{errors.iv}</div>}
        </div>
        <div className="mr-field">
          <div className="mr-field-top">
            <label className="mr-field-label" htmlFor="mt-last">Last completed</label>
          </div>
          <input id="mt-last" type="date" max={todayDateOnly()} className={`mr-input mr-input-date ${errors.last ? "err" : ""}`}
            value={values.lastCompletedDate} onChange={(e) => updateValue("lastCompletedDate", e.target.value)} />
          {errors.last ? <div className="mr-field-err"><Icon name="alert" size={13} stroke={2} />{errors.last}</div> :
            <div className="mr-field-hint">Optional — when was this last done? Leave blank to start counting from today.</div>}
        </div>
      </div>
      <div className="mr-form-actions">
        <button className="mr-btn mr-btn-ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button className="mr-btn mr-btn-primary mr-btn-save" onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending ? <><span className="mr-spinner" />Saving…</> : <><Icon name="check" size={15} stroke={2.4} />Save task</>}
        </button>
      </div>
    </div>
  );
}

// ─── form ────────────────────────────────────────────────────────────────────

const TITLE_MAX = 100;
const NOTES_MAX = 1000;

function validateForm(
  title: string,
  performedAt: string,
  notes: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const t = title.trim();
  if (!t) errors.title = "Title is required.";
  else if (t.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;
  if (!performedAt) errors.performedAt = "Performed date is required.";
  else if (performedAt > todayDateOnly())
    errors.performedAt = "Performed date must be today or earlier.";
  if (notes.length > NOTES_MAX) errors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  return errors;
}

interface MRFormProps {
  asset: AssetPresentation;
  assetId: string;
  variant: "drawer" | "sheet";
  onClose: () => void;
  onSaved: (record: MaintenanceRecord) => void;
  tasks?: MaintenanceTask[];
  preselectedTaskId?: string | null;
}

function MRForm({ asset, assetId, variant, onClose, onSaved, tasks = [], preselectedTaskId = null }: MRFormProps) {
  const [title, setTitle] = useState("");
  const [performedAt, setPerformedAt] = useState(todayDateOnly());
  const [notes, setNotes] = useState("");
  const [taskId, setTaskId] = useState<string>(preselectedTaskId || "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      createMaintenanceRecord(assetId, {
        title: title.trim(),
        performedAt,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(taskId ? { taskId } : {}),
      }),
    onSuccess: (record) => onSaved(record),
    onError: (err) =>
      setBanner(err instanceof Error ? err.message : "Failed to save. Please try again."),
  });

  const clearErr = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const handleSubmit = () => {
    if (mutation.isPending) return;
    const errs = validateForm(title, performedAt, notes);
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setBanner("Please fix the highlighted fields before saving.");
      return;
    }
    setBanner(null);
    mutation.mutate();
  };

  const effectiveTasks = tasks; // already for this asset
  const isPreselected = !!preselectedTaskId;

  return (
    <div className={`mr-form mr-form-${variant}`}>
      {variant === "sheet" && <div className="mr-sheet-grab" />}
      <div className="mr-form-head">
        <div className="mr-form-head-txt">
          <div className="mr-form-title">Log maintenance</div>
          <div className="mr-form-sub">{asset.name}</div>
        </div>
        <button className="mr-form-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={15} stroke={2.2} />
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="mr-form-body">
          {banner && (
            <div className="mr-banner" role="alert">
              <Icon name="alert" size={15} stroke={2} />
              <span>{banner}</span>
            </div>
          )}

          <div className="mr-field">
            <div className="mr-field-top">
              <label className="mr-field-label" htmlFor="mr-title">
                Title <span className="mr-req">*</span>
              </label>
              <span className={`mr-field-count ${title.length > TITLE_MAX ? "over" : ""}`}>
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              id="mr-title"
              ref={titleRef}
              type="text"
              className={`mr-input ${fieldErrors.title ? "err" : ""}`}
              placeholder='What did you do? e.g. "Oil change"'
              maxLength={TITLE_MAX + 20}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearErr("title");
                if (banner) setBanner(null);
              }}
            />
            {fieldErrors.title && (
              <div className="mr-field-err">
                <Icon name="alert" size={13} stroke={2} />{fieldErrors.title}
              </div>
            )}
          </div>

          <div className="mr-field">
            <div className="mr-field-top">
              <label className="mr-field-label" htmlFor="mr-date">
                Performed date <span className="mr-req">*</span>
              </label>
            </div>
            <input
              id="mr-date"
              type="date"
              className={`mr-input mr-input-date ${fieldErrors.performedAt ? "err" : ""}`}
              max={todayDateOnly()}
              value={performedAt}
              onChange={(e) => {
                setPerformedAt(e.target.value);
                clearErr("performedAt");
                if (banner) setBanner(null);
              }}
            />
            {fieldErrors.performedAt ? (
              <div className="mr-field-err">
                <Icon name="alert" size={13} stroke={2} />{fieldErrors.performedAt}
              </div>
            ) : (
              <div className="mr-field-hint">When the work was done. Today or earlier.</div>
            )}
          </div>

          {effectiveTasks.length > 0 && (
            <div className="mr-field">
              <label className="mr-field-label" htmlFor="mr-task-link">Linked task</label>
              <select
                id="mr-task-link"
                className="mr-input mr-select"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                disabled={isPreselected}
              >
                <option value="">— None —</option>
                {effectiveTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <div className="mr-field-hint">
                {isPreselected
                  ? "Linked from schedule — saving will advance the next-due date."
                  : "Optionally link this record to a scheduled task."}
              </div>
            </div>
          )}

          <div className="mr-field">
            <div className="mr-field-top">
              <label className="mr-field-label" htmlFor="mr-notes">Notes</label>
              <span className={`mr-field-count ${notes.length > NOTES_MAX ? "over" : ""}`}>
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
            <textarea
              id="mr-notes"
              className={`mr-input mr-textarea ${fieldErrors.notes ? "err" : ""}`}
              placeholder="Optional — location, condition, cost, vendor, quantity…"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                clearErr("notes");
                if (banner) setBanner(null);
              }}
            />
            {fieldErrors.notes ? (
              <div className="mr-field-err">
                <Icon name="alert" size={13} stroke={2} />{fieldErrors.notes}
              </div>
            ) : (
              <div className="mr-field-hint">
                Free-form details. No structured fields — just write what's useful.
              </div>
            )}
          </div>
        </div>

        <div className="mr-form-actions">
          <button type="button" className="mr-btn mr-btn-ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            type="submit"
            className="mr-btn mr-btn-primary mr-btn-save"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><span className="mr-spinner" />Saving…</>
            ) : (
              <><Icon name="check" size={15} stroke={2.4} />Save record</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export function AppMaintenanceRecords() {
  const { assetId = "" } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const rootRef = useRef<HTMLDivElement>(null);
  // Start at 0 so the first render defaults to mobile rather than using
  // window.innerWidth, which can be wider than the actual container.
  const [containerWidth, setContainerWidth] = useState(0);
  const isMobile = containerWidth <= 600;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [logFromTaskId, setLogFromTaskId] = useState<string | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "maintenance">("overview");
  const [density, setDensity] = useState<"timeline" | "table">("timeline");
  const [taskDeleteError, setTaskDeleteError] = useState<string | null>(null);

  const assetQuery = useQuery({
    queryKey: assetQueryKey(assetId),
    queryFn: () => getAsset(assetId),
    enabled: !!assetId,
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) &&
      count < 2,
  });

  const recordsQuery = useQuery({
    queryKey: maintenanceRecordsQueryKey(assetId),
    queryFn: () => listMaintenanceRecords(assetId),
    enabled: !!assetId && assetQuery.isSuccess,
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) && count < 2,
  });

  const tasksQuery = useQuery({
    queryKey: maintenanceTasksQueryKey(assetId),
    queryFn: () => listMaintenanceTasks(assetId),
    enabled: !!assetId && assetQuery.isSuccess,
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 2,
  });

  // Redirect on 401
  useEffect(() => {
    const isUnauth =
      (assetQuery.error instanceof ApiError && assetQuery.error.status === 401) ||
      (recordsQuery.error instanceof ApiError && recordsQuery.error.status === 401) ||
      (tasksQuery.error instanceof ApiError && tasksQuery.error.status === 401);
    if (isUnauth) void navigate(paths.login(), { replace: true });
  }, [assetQuery.error, recordsQuery.error, tasksQuery.error, navigate]);

  const asset = assetQuery.data ? toAssetPresentation(assetQuery.data) : null;

  const sorted = useMemo(
    () => sortRecords(recordsQuery.data?.maintenanceRecords ?? []),
    [recordsQuery.data],
  );
  const groups = useMemo(() => groupByYear(sorted), [sorted]);

  const tasks = useMemo(
    () => (tasksQuery.data?.maintenanceTasks ?? []),
    [tasksQuery.data],
  );

  const effectiveDensity = isMobile ? "timeline" : density;

  const handleSaved = (record: MaintenanceRecord) => {
    queryClient.setQueryData(
      maintenanceRecordsQueryKey(assetId),
      (old: MaintenanceRecordListResponse | undefined): MaintenanceRecordListResponse => ({
        maintenanceRecords: [record, ...(old?.maintenanceRecords ?? [])],
      }),
    );
    // Backend advanced the linked task if applicable; refetch to get updated nextDue
    if (record.taskId) {
      void queryClient.invalidateQueries({ queryKey: maintenanceTasksQueryKey(assetId) });
    }
    setFormOpen(false);
    setLogFromTaskId(null);
    // Surface the new record by switching to Maintenance tab (unless was from task log in overview)
    if (!logFromTaskId) setActiveTab("maintenance");
  };

  const openLogForm = (fromTaskId: string | null = null) => {
    setLogFromTaskId(fromTaskId);
    setFormOpen(true);
  };

  const handleTaskCreated = (task: MaintenanceTask) => {
    queryClient.setQueryData(
      maintenanceTasksQueryKey(assetId),
      (old: any) => {
        const existing = (old?.maintenanceTasks ?? []) as MaintenanceTask[];
        // ID-based dedup in case of double onSuccess (e.g. slow network + retry)
        const withoutDup = existing.filter((t) => t.id !== task.id);
        return { maintenanceTasks: [task, ...withoutDup] };
      },
    );
    setTaskFormOpen(false);
  };

  const handleTaskDeleted = async (taskId: string) => {
    setTaskDeleteError(null);
    try {
      await deleteMaintenanceTask(assetId, taskId);
      queryClient.setQueryData(
        maintenanceTasksQueryKey(assetId),
        (old: any) => ({ maintenanceTasks: (old?.maintenanceTasks ?? []).filter((t: MaintenanceTask) => t.id !== taskId) }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete task. Please try again.";
      setTaskDeleteError(msg);
      void queryClient.invalidateQueries({ queryKey: maintenanceTasksQueryKey(assetId) });
    }
  };

  // ── derive page title
  useEffect(() => {
    document.title = asset ? `${asset.name} — Maintenance · FieldOps` : "Maintenance · FieldOps";
    return () => { document.title = "FieldOps"; };
  }, [asset]);

  // ── error kinds
  const assetErr = assetQuery.error instanceof ApiError ? assetQuery.error : null;
  const assetStatus = assetErr?.status;
  if (assetStatus === 403) {
    return (
      <div ref={rootRef} className="hf mr-root">
        <HFTopBar />
        <main className="mr-main mr-scroll" data-layout="focus">
          <div className="mr-focus-wrap">
            <MRErrorState kind="forbidden" />
          </div>
        </main>
        <HFBottomNav />
      </div>
    );
  }
  if (assetStatus === 404) {
    return (
      <div ref={rootRef} className="hf mr-root">
        <HFTopBar />
        <main className="mr-main mr-scroll" data-layout="focus">
          <div className="mr-focus-wrap">
            <MRErrorState kind="notfound" />
          </div>
        </main>
        <HFBottomNav />
      </div>
    );
  }

  // ── history area (Maintenance tab)
  const renderHistory = () => {
    if (recordsQuery.isPending) return <MRLoading density={effectiveDensity} />;
    if (recordsQuery.isError)
      return (
        <MRErrorState
          kind="error"
          onRetry={() => void recordsQuery.refetch()}
        />
      );
    if (sorted.length === 0)
      return <MREmpty assetName={asset?.name ?? "this asset"} onAdd={() => openLogForm()} />;
    return effectiveDensity === "table"
      ? <MRTable groups={groups} />
      : <MRTimeline groups={groups} />;
  };

  const histBlock = (
    <div className="mr-hist-wrap">
      {recordsQuery.isSuccess && sorted.length > 0 && (
        <div className="mr-hist-head">
          <div className="mr-hist-head-txt">
            <span className="mr-hist-title">History</span>
            <span className="mr-hist-meta">
              newest first · {sorted.length} {sorted.length === 1 ? "record" : "records"}
            </span>
          </div>
          {!isMobile && (
            <div className="mr-density" role="group" aria-label="History density">
              <button
                className={density === "timeline" ? "active" : ""}
                onClick={() => setDensity("timeline")}
              >
                <Icon name="menu" size={14} stroke={2} />Timeline
              </button>
              <button
                className={density === "table" ? "active" : ""}
                onClick={() => setDensity("table")}
              >
                <Icon name="grid" size={13} stroke={2} />Table
              </button>
            </div>
          )}
        </div>
      )}
      {renderHistory()}
    </div>
  );

  // ── overview block
  const overviewBlock = asset ? (
    <MROverviewTab
      tasks={tasks}
      records={sorted}
      tasksLoading={tasksQuery.isPending}
      onLogFromTask={(tid) => openLogForm(tid)}
      onDeleteTask={handleTaskDeleted}
      onAddTask={() => setTaskFormOpen(true)}
      onViewAll={() => setActiveTab("maintenance")}
    />
  ) : null;

  const overlayVariant: "drawer" | "sheet" = isMobile ? "sheet" : "drawer";
  const showMobileAddBar =
    isMobile &&
    !assetQuery.isError &&
    (activeTab === "maintenance" ? (recordsQuery.isSuccess && sorted.length > 0) : true) &&
    !taskFormOpen &&
    !formOpen;

  return (
    <div ref={rootRef} className="hf mr-root" data-density={effectiveDensity}>
      <HFTopBar />

      <main className="mr-main mr-scroll" data-layout="focus">
        <div className="mr-focus-wrap">
          {/* breadcrumb */}
          <div className="mr-crumb">
            <Link to={paths.assets} className="mr-crumb-link">Assets</Link>
            <Icon name="chevron-right" size={14} color="var(--hf-ink-faint)" />
            <span className="mr-crumb-cur">{asset?.name ?? "…"}</span>
          </div>

          {/* hero */}
          {asset ? (
            <div className="mr-hero">
              <HFAssetIcon asset={{ category: asset.cat, icon: asset.icon }} size={56} />
              <div className="mr-hero-id">
                <h1 className="mr-hero-name">{asset.name}</h1>
                <div className="mr-hero-meta">
                  <span className="hf-mono">{asset.displayId}</span>
                  <span className="mr-dot" />
                  <span>{asset.summary}</span>
                </div>
              </div>
              {!recordsQuery.isPending && (
                <button
                  className="mr-btn mr-btn-primary mr-hero-add"
                  onClick={() => openLogForm()}
                >
                  <Icon name="plus" size={16} stroke={2.2} />Log maintenance
                </button>
              )}
            </div>
          ) : assetQuery.isPending ? (
            <div className="mr-hero">
              <div className="mr-skel" style={{ width: 56, height: 56, borderRadius: 14 }} />
              <div className="mr-hero-id" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="mr-skel mr-skel-w80" style={{ height: 28, borderRadius: 8 }} />
                <span className="mr-skel mr-skel-w50" />
              </div>
            </div>
          ) : (
            <div className="mr-hero">
              <div className="mr-hero-id">
                <h1 className="mr-hero-name">Asset</h1>
              </div>
            </div>
          )}

          {taskDeleteError && (
            <div className="mr-banner" role="alert">
              <Icon name="alert" size={15} stroke={2} />
              <span>{taskDeleteError}</span>
              <button
                className="mr-btn mr-btn-ghost"
                style={{ marginLeft: "auto", fontSize: "12px", padding: "2px 8px" }}
                onClick={() => setTaskDeleteError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* tabs */}
          <div className="mr-tabs" role="tablist">
            <button
              className={`mr-tab ${activeTab === "overview" ? "active" : ""}`}
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              className={`mr-tab ${activeTab === "maintenance" ? "active" : ""}`}
              role="tab"
              aria-selected={activeTab === "maintenance"}
              onClick={() => setActiveTab("maintenance")}
            >
              Maintenance{" "}
              <span className="mr-tab-count">
                {recordsQuery.isSuccess ? sorted.length : "—"}
              </span>
            </button>
          </div>

          {/* content or full-page error */}
          {assetQuery.isError ? (
            <MRErrorState
              kind="error"
              onRetry={() => void assetQuery.refetch()}
            />
          ) : activeTab === "overview" ? (
            overviewBlock
          ) : (
            histBlock
          )}
        </div>
      </main>

      {showMobileAddBar && (
        <div className="mr-addbar">
          <button
            className="mr-btn mr-btn-primary mr-addbar-btn"
            onClick={() => openLogForm()}
          >
            <Icon name="plus" size={17} stroke={2.2} />Add record
          </button>
        </div>
      )}

      <HFBottomNav />

      {formOpen && asset && (
        <div className={`mr-overlay mr-overlay-${overlayVariant}`}>
          <div className="mr-scrim" onClick={() => { setFormOpen(false); setLogFromTaskId(null); }} />
          <div className={`mr-overlay-panel-${overlayVariant}`}>
            <MRForm
              asset={asset}
              assetId={assetId}
              variant={overlayVariant}
              onClose={() => { setFormOpen(false); setLogFromTaskId(null); }}
              onSaved={handleSaved}
              tasks={tasks}
              preselectedTaskId={logFromTaskId}
            />
          </div>
        </div>
      )}

      {taskFormOpen && asset && (
        <div className={`mr-overlay mr-overlay-${overlayVariant}`}>
          <div className="mr-scrim" onClick={() => setTaskFormOpen(false)} />
          <div className={`mr-overlay-panel-${overlayVariant}`}>
            <MRCreateTaskForm
              asset={asset}
              variant={overlayVariant}
              onClose={() => setTaskFormOpen(false)}
              onCreated={handleTaskCreated}
            />
          </div>
        </div>
      )}
    </div>
  );
}
