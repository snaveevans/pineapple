import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { assetsQueryKey, listAssets } from "../api/assets.ts";
import { dashboardQueryKey, getDashboard } from "../api/dashboard.ts";
import { createMaintenanceRecord, maintenanceRecordsQueryKey } from "../api/maintenanceRecords.ts";
import { maintenanceTasksQueryKey } from "../api/maintenanceTasks.ts";
import { ApiError } from "../api/client.ts";
import { Icon } from "../design/Icon.tsx";
import { HFAssetIcon, HFStatusPill } from "../design/hf.tsx";
import { HFTopBar, HFBottomNav } from "./AppChrome.tsx";
import {
  type DashboardCategoryFilter,
  type DashboardQueuePresentation,
  filterQueueByCategory,
  formatFleetSubline,
  toQueuePresentation,
} from "./dashboardPresentation.ts";
import { toAssetPresentation } from "./assetPresentation.ts";
import { AddServiceModal } from "./AddServiceModal.tsx";
import { formatDashboardGreeting as formatGreeting } from "./profilePresentation.ts";
import { paths } from "../routes.ts";

import "../design/styles/hifi.css";

function HFDetailBody({
  item,
  compact = false,
  isNextUp = false,
  onMarkComplete,
  completing = false,
  completeError,
}: {
  item: DashboardQueuePresentation;
  compact?: boolean;
  isNextUp?: boolean;
  onMarkComplete: () => void;
  completing?: boolean;
  completeError?: string | null;
}) {
  return (
    <div className="hf-detail-body" data-compact={compact}>
      {!compact && (
        <>
          <div className="hf-detail-head">
            <span className="hf-eyebrow">
              <Icon name="arrow-right" size={12} stroke={2.2} />
              {isNextUp ? "Next up" : "Selected"}
            </span>
            <HFStatusPill status={item.status} due={item.due} />
          </div>
          <div className="hf-asset-row">
            <HFAssetIcon asset={item} size={56} />
            <div className="hf-asset-id">
              <h2 className="hf-asset-name">{item.name}</h2>
              <div className="hf-asset-meta">
                <span className="hf-mono">{item.displayId}</span>
                <span className="hf-dot-sep" />
                <span>last service {item.last}</span>
              </div>
            </div>
          </div>
          <div className="hf-divider" />
        </>
      )}

      <div className="hf-service-block">
        <div className="hf-label">Service due</div>
        <div className="hf-service-name">{item.service}</div>
      </div>

      <div className="hf-meta-grid">
        <div className="hf-meta-item">
          <Icon name="repeat" size={14} color="var(--hf-ink-faint)" />
          <div className="hf-meta-text">
            <div className="hf-label-sm">Recurs</div>
            <div className="hf-meta-val">{item.recurs}</div>
          </div>
        </div>
      </div>

      {completeError ? (
        <p className="hf-notes-text" role="alert" style={{ color: "var(--hf-bad)" }}>
          <Icon name="alert" size={14} stroke={2} /> {completeError}
        </p>
      ) : null}

      <div className="hf-actions">
        <button
          className="hf-btn hf-btn-primary"
          onClick={onMarkComplete}
          disabled={completing}
        >
          <Icon name="check" size={14} stroke={2.2} />
          {completing ? "Saving…" : "Mark complete"}
        </button>
        <button className="hf-btn hf-btn-secondary" disabled title="Coming soon">
          <Icon name="calendar" size={14} />
          Reschedule
        </button>
        <button className="hf-btn hf-btn-ghost" disabled title="Coming soon">
          <Icon name="snooze" size={14} />
          Snooze
        </button>
        {!compact && (
          <Link className="hf-btn hf-btn-ghost hf-btn-end" to={paths.assetMaintenance(item.assetId)}>
            View asset
            <Icon name="chevron-right" size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

function HFGreeting({
  displayName,
  subline,
  health,
}: {
  displayName: string | null | undefined;
  subline: string;
  health: { overdue: number; soon: number; onTrack: number };
}) {
  return (
    <div className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">
          {formatGreeting(displayName)} <span className="hf-wave">·</span>
        </h1>
        <div className="hf-greeting-sub">{subline}</div>
      </div>
      <div className="hf-stats">
        <div className="hf-stat hf-stat-bad">
          <div className="hf-stat-val">{health.overdue}</div>
          <div className="hf-stat-lbl">Overdue</div>
        </div>
        <div className="hf-stat hf-stat-warn">
          <div className="hf-stat-val">{health.soon}</div>
          <div className="hf-stat-lbl">Due soon</div>
        </div>
        <div className="hf-stat hf-stat-ok">
          <div className="hf-stat-val">{health.onTrack}</div>
          <div className="hf-stat-lbl">On track</div>
        </div>
      </div>
    </div>
  );
}

function HFDashboardState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="hf-assets-state">
      <div className="hf-assets-state-title">{title}</div>
      <div className="hf-assets-state-sub">{description}</div>
      {action}
    </div>
  );
}

const CATEGORY_FILTERS: { id: DashboardCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "vehicle", label: "Vehicles" },
  { id: "equipment", label: "Equipment" },
  { id: "property", label: "Properties" },
];

export function AppHome({ mobileMode = "inline" }: { mobileMode?: "inline" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<DashboardCategoryFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<{
    taskId: string;
    message: string;
  } | null>(null);
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: getDashboard,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: listAssets,
    enabled: addServiceOpen,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  const completeMutation = useMutation({
    mutationFn: async (item: DashboardQueuePresentation) => {
      if (!dashboardQuery.data) throw new Error("Dashboard is not loaded");
      return createMaintenanceRecord(item.assetId, {
        title: item.service,
        performedAt: dashboardQuery.data.todayUtc,
        taskId: item.taskId,
      });
    },
    onMutate: (item) => {
      setCompletingTaskId(item.taskId);
      setCompleteError(null);
    },
    onSuccess: async (_record, item) => {
      setCompletingTaskId(null);
      setCompleteError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: maintenanceRecordsQueryKey(item.assetId) }),
        queryClient.invalidateQueries({ queryKey: maintenanceTasksQueryKey(item.assetId) }),
      ]);
    },
    onError: async (error, item) => {
      setCompletingTaskId(null);
      if (error instanceof ApiError && error.status === 401) {
        navigate(paths.login(), { replace: true });
        return;
      }
      setCompleteError({
        taskId: item.taskId,
        message: error instanceof Error ? error.message : "Could not mark task complete.",
      });
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });

  useEffect(() => {
    document.title = "FieldOps — Home";
  }, []);

  useEffect(() => {
    if (dashboardQuery.error instanceof ApiError && dashboardQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [dashboardQuery.error, navigate]);

  useEffect(() => {
    if (assetsQuery.error instanceof ApiError && assetsQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [assetsQuery.error, navigate]);

  const queue = useMemo(() => {
    if (!dashboardQuery.data) return [];
    return dashboardQuery.data.queue.map((item) => toQueuePresentation(item));
  }, [dashboardQuery.data]);

  const filteredQueue = useMemo(
    () => filterQueueByCategory(queue, category),
    [queue, category],
  );

  useEffect(() => {
    if (filteredQueue.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !filteredQueue.some((item) => item.taskId === selectedTaskId)) {
      setSelectedTaskId(filteredQueue[0]!.taskId);
    }
  }, [filteredQueue, selectedTaskId]);

  const selected = filteredQueue.find((item) => item.taskId === selectedTaskId) ?? filteredQueue[0];
  const isNextUp = selected?.taskId === filteredQueue[0]?.taskId;

  const completeErrorFor = (taskId: string) =>
    completeError?.taskId === taskId ? completeError.message : null;

  const assetPresentations = useMemo(
    () => (assetsQuery.data?.assets ?? []).map(toAssetPresentation),
    [assetsQuery.data],
  );

  const handleServiceSaved = async (task: { assetId: string }) => {
    const results = await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      queryClient.invalidateQueries({ queryKey: maintenanceTasksQueryKey(task.assetId) }),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      throw failed.reason;
    }
  };

  if (dashboardQuery.isPending) {
    return (
      <div className={`hf hf-app hf-mobile-${mobileMode}`}>
        <HFTopBar />
        <main className="hf-main hf-shell">
          <HFDashboardState
            title="Loading dashboard"
            description="Fetching your fleet health and maintenance queue..."
          />
        </main>
        <HFBottomNav />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className={`hf hf-app hf-mobile-${mobileMode}`}>
        <HFTopBar />
        <main className="hf-main hf-shell">
          <HFDashboardState
            title="Dashboard could not be loaded"
            description={dashboardQuery.error.message}
            action={
              <button
                className="hf-btn hf-btn-secondary"
                onClick={() => void dashboardQuery.refetch()}
              >
                Try again
              </button>
            }
          />
        </main>
        <HFBottomNav />
      </div>
    );
  }

  const dashboard = dashboardQuery.data;

  if (dashboard.fleetTotals.total === 0) {
    return (
      <div className={`hf hf-app hf-mobile-${mobileMode}`}>
        <HFTopBar />
        <main className="hf-main hf-shell">
          <HFGreeting
            displayName={dashboard.viewerDisplayName}
            subline={formatFleetSubline(dashboard.todayUtc, 0)}
            health={{ overdue: 0, soon: 0, onTrack: 0 }}
          />
          <HFDashboardState
            title="No assets yet"
            description="Add your first vehicle, property, or piece of equipment to start tracking maintenance."
            action={
              <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
                <Icon name="plus" size={14} stroke={2.2} />
                Add asset
              </Link>
            }
          />
        </main>
        <HFBottomNav />
      </div>
    );
  }

  return (
    <div className={`hf hf-app hf-mobile-${mobileMode}`}>
      <HFTopBar />
      <main className="hf-main hf-shell">
        <HFGreeting
          displayName={dashboard.viewerDisplayName}
          subline={formatFleetSubline(dashboard.todayUtc, dashboard.fleetTotals.total)}
          health={{
            overdue: dashboard.fleetHealth.overdue,
            soon: dashboard.fleetHealth.soon,
            onTrack: dashboard.fleetHealth.onTrack,
          }}
        />

        <div className="hf-filters">
          <div className="hf-filter-chips">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`hf-chip ${category === filter.id ? "active" : ""}`}
                onClick={() => setCategory(filter.id)}
              >
                {filter.label}
                <span className="hf-chip-count">{dashboard.queueCountsByCategory[filter.id]}</span>
              </button>
            ))}
          </div>
          <button
            className="hf-btn hf-btn-secondary hf-btn-sm"
            onClick={() => setAddServiceOpen(true)}
          >
            <Icon name="plus" size={14} stroke={2} />
            Add service
          </button>
        </div>

        {queue.length === 0 ? (
          <HFDashboardState
            title="No scheduled maintenance yet"
            description="Add maintenance tasks to your assets so the dashboard can track what's due next."
            action={
              <Link className="hf-btn hf-btn-primary" to={paths.assets}>
                Go to assets
              </Link>
            }
          />
        ) : filteredQueue.length === 0 || !selected ? (
          <HFDashboardState
            title="No tasks in this category"
            description="Try another filter to see scheduled maintenance for that asset type."
            action={
              <button className="hf-btn hf-btn-secondary" onClick={() => setCategory("all")}>
                Show all tasks
              </button>
            }
          />
        ) : (
          <div className="hf-grid">
            <section className="hf-detail-card" data-status={selected.status}>
              <HFDetailBody
                item={selected}
                isNextUp={isNextUp}
                onMarkComplete={() => completeMutation.mutate(selected)}
                completing={completingTaskId === selected.taskId}
                completeError={completeErrorFor(selected.taskId)}
              />
            </section>

            <section className="hf-queue">
              <div className="hf-queue-head">
                <h3 className="hf-h3">Queue</h3>
                <span className="hf-mono hf-ink-faint">
                  By urgency · {filteredQueue.length}
                </span>
              </div>
              <ul className="hf-queue-list">
                {filteredQueue.map((item) => {
                  const isSel = item.taskId === selectedTaskId;
                  return (
                    <li
                      key={item.taskId}
                      className={`hf-row ${isSel ? "selected" : ""}`}
                      data-status={item.status}
                      onClick={() => {
                        setSelectedTaskId(item.taskId);
                        setCompleteError(null);
                      }}
                    >
                      <div className="hf-row-summary">
                        <HFAssetIcon asset={item} size={36} />
                        <div className="hf-row-text">
                          <div className="hf-row-name">{item.name}</div>
                          <div className="hf-row-sub">{item.service}</div>
                        </div>
                        <div className="hf-row-right">
                          <div className="hf-row-due">{item.due}</div>
                          <span className="hf-status-dot" data-status={item.status} />
                        </div>
                      </div>
                      {isSel && (
                        <div className="hf-row-detail">
                          <HFDetailBody
                            item={item}
                            compact
                            isNextUp={isNextUp}
                            onMarkComplete={() => completeMutation.mutate(item)}
                            completing={completingTaskId === item.taskId}
                            completeError={completeErrorFor(item.taskId)}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </main>
      <HFBottomNav />

      {addServiceOpen && dashboardQuery.data && (
        assetsQuery.isPending ? (
          <div className="hf-svc-overlay">
            <div className="hf-svc-scrim" onClick={() => setAddServiceOpen(false)} />
            <div className="hf-svc-drawer" role="dialog" aria-modal="true" aria-label="Add a service">
              <div className="hf-svc-head">
                <div>
                  <div className="hf-svc-title">Add a service</div>
                  <div className="hf-svc-sub">Schedule recurring work for an asset.</div>
                </div>
                <button
                  className="hf-icon-btn"
                  onClick={() => setAddServiceOpen(false)}
                  aria-label="Close"
                >
                  <Icon name="x" size={16} stroke={2} />
                </button>
              </div>
              <div className="hf-svc-body">
                <HFDashboardState
                  title="Loading assets"
                  description="Fetching your fleet so you can choose where to schedule this service…"
                />
              </div>
            </div>
          </div>
        ) : assetsQuery.isError ? (
          <div className="hf-svc-overlay">
            <div className="hf-svc-scrim" onClick={() => setAddServiceOpen(false)} />
            <div className="hf-svc-drawer" role="dialog" aria-modal="true" aria-label="Add a service">
              <div className="hf-svc-head">
                <div>
                  <div className="hf-svc-title">Add a service</div>
                  <div className="hf-svc-sub">Schedule recurring work for an asset.</div>
                </div>
                <button
                  className="hf-icon-btn"
                  onClick={() => setAddServiceOpen(false)}
                  aria-label="Close"
                >
                  <Icon name="x" size={16} stroke={2} />
                </button>
              </div>
              <div className="hf-svc-body">
                <HFDashboardState
                  title="Assets could not be loaded"
                  description={assetsQuery.error.message}
                  action={
                    <button
                      className="hf-btn hf-btn-secondary"
                      onClick={() => void assetsQuery.refetch()}
                    >
                      Try again
                    </button>
                  }
                />
              </div>
            </div>
          </div>
        ) : assetPresentations.length > 0 ? (
          <AddServiceModal
            assets={assetPresentations}
            defaultAssetId={selected?.assetId ?? null}
            todayUtc={dashboardQuery.data.todayUtc}
            onClose={() => setAddServiceOpen(false)}
            onSaved={handleServiceSaved}
          />
        ) : (
          <div className="hf-svc-overlay">
            <div className="hf-svc-scrim" onClick={() => setAddServiceOpen(false)} />
            <div className="hf-svc-drawer" role="dialog" aria-modal="true" aria-label="Add a service">
              <div className="hf-svc-head">
                <div>
                  <div className="hf-svc-title">Add a service</div>
                  <div className="hf-svc-sub">Schedule recurring work for an asset.</div>
                </div>
                <button
                  className="hf-icon-btn"
                  onClick={() => setAddServiceOpen(false)}
                  aria-label="Close"
                >
                  <Icon name="x" size={16} stroke={2} />
                </button>
              </div>
              <div className="hf-svc-body">
                <HFDashboardState
                  title="No assets available"
                  description="Add an asset before scheduling a service."
                  action={
                    <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
                      <Icon name="plus" size={14} stroke={2.2} />
                      Add asset
                    </Link>
                  }
                />
              </div>
              <div className="hf-svc-foot">
                <button className="hf-btn hf-btn-primary" onClick={() => setAddServiceOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}