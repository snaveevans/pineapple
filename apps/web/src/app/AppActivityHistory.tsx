import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  activityQueryKey,
  listActivity,
  type ActivityAssetFilter,
  type ActivityEntryType,
  type ActivityFilters,
  type ActivityTypeFilter,
} from "../api/activity.ts";
import { ApiError } from "../api/client.ts";
import { Icon } from "../design/Icon.tsx";
import { paths } from "../routes.ts";
import { HFBottomNav, HFTopBar } from "./AppChrome.tsx";
import { assetTypeLabel } from "./assetPresentation.ts";
import {
  ACTIVITY_TYPE_META,
  activityTypeLabel,
  groupActivityEntries,
  type ActivityDayGroup,
} from "./activityPresentation.ts";

import "../design/styles/hifi.css";
import "./styles/activity-history.css";

const PAGE_SIZE = 25;

const TYPE_ORDER: ActivityEntryType[] = [
  "asset_added",
  "maintenance_logged",
  "task_completed",
  "task_scheduled",
  "task_deleted",
];

function ActivityFiltersToolbar({
  activeType,
  activeAssetId,
  typeFilters,
  assetFilters,
  onTypeChange,
  onAssetChange,
  onClear,
}: {
  activeType: ActivityEntryType | undefined;
  activeAssetId: string | undefined;
  typeFilters: ActivityTypeFilter[];
  assetFilters: ActivityAssetFilter[];
  onTypeChange: (type: ActivityEntryType | undefined) => void;
  onAssetChange: (assetId: string | undefined) => void;
  onClear: () => void;
}) {
  const typeCounts = new Map(typeFilters.map((filter) => [filter.type, filter.count]));
  const total = typeFilters.reduce((sum, filter) => sum + filter.count, 0);
  const hasActiveFilter = activeType !== undefined || activeAssetId !== undefined;

  return (
    <div className="ah-toolbar">
      <div className="hf-filter-chips" role="group" aria-label="Filter activity by type">
        <button
          type="button"
          className={`hf-chip ${activeType === undefined ? "active" : ""}`}
          aria-pressed={activeType === undefined}
          onClick={() => onTypeChange(undefined)}
        >
          All
          <span className="hf-chip-count">{total}</span>
        </button>
        {TYPE_ORDER.map((type) => {
          const count = typeCounts.get(type) ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={type}
              type="button"
              className={`hf-chip ${activeType === type ? "active" : ""}`}
              aria-pressed={activeType === type}
              onClick={() => onTypeChange(type)}
            >
              {activityTypeLabel(type)}
              <span className="hf-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="ah-toolbar-end">
        {assetFilters.length > 0 && (
          <label className="ah-select-wrap">
            <span className="ah-select-label">Asset</span>
            <select
              className="ah-select"
              value={activeAssetId ?? "all"}
              onChange={(event) =>
                onAssetChange(
                  event.currentTarget.value === "all" ? undefined : event.currentTarget.value,
                )
              }
            >
              <option value="all">All assets</option>
              {assetFilters.map((filter) => (
                <option key={filter.asset.id} value={filter.asset.id}>
                  {filter.asset.name} ({filter.count})
                </option>
              ))}
            </select>
          </label>
        )}
        {hasActiveFilter && (
          <button type="button" className="hf-btn hf-btn-ghost" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ah-state">
      <div className="ah-state-icon">{icon}</div>
      <div className="ah-state-title">{title}</div>
      <div className="ah-state-sub">{description}</div>
      {action}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="ah-feed" aria-busy="true" aria-label="Loading activity">
      {[0, 1, 2, 3].map((row) => (
        <div className="ah-skel-row" key={row}>
          <span className="ah-skel-dot" />
          <span className="ah-skel-line ah-skel-line-main" />
          <span className="ah-skel-line ah-skel-line-sub" />
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ groups }: { groups: ActivityDayGroup[] }) {
  return (
    <div className="ah-feed">
      {groups.map((group) => (
        <section className="ah-day" key={group.key} aria-labelledby={`activity-day-${group.key}`}>
          <h2 id={`activity-day-${group.key}`} className="ah-day-label">
            {group.label}
          </h2>
          <div className="ah-day-list">
            {group.entries.map((entry) => {
              const meta = ACTIVITY_TYPE_META[entry.type];
              return (
                <article className="ah-entry" key={entry.id} data-tone={entry.tone}>
                  <div className="ah-entry-icon">
                    <Icon name={entry.icon} size={17} stroke={2} />
                  </div>
                  <div className="ah-entry-main">
                    <div className="ah-entry-top">
                      <span className="ah-entry-action">{entry.actionLabel}</span>
                      <span className="ah-entry-time">{entry.timeLabel}</span>
                    </div>
                    <div className="ah-entry-title">{entry.headline}</div>
                    <div className="ah-entry-detail">{entry.detail}</div>
                  </div>
                  <Link
                    to={paths.assetMaintenance(entry.asset.id)}
                    className="ah-entry-asset"
                    title={`Open ${entry.asset.name}`}
                  >
                    <span>{assetTypeLabel(entry.asset.type)}</span>
                    <Icon name="chevron-right" size={14} />
                  </Link>
                  <span className="ah-entry-chip">{meta.label}</span>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AppActivityHistory() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ActivityFilters>({});

  const activityQuery = useInfiniteQuery({
    queryKey: activityQueryKey(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listActivity({
        ...filters,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  useEffect(() => {
    document.title = "FieldOps - History";
  }, []);

  useEffect(() => {
    if (activityQuery.error instanceof ApiError && activityQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [activityQuery.error, navigate]);

  const entries = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.entries) ?? [],
    [activityQuery.data],
  );
  const firstPage = activityQuery.data?.pages[0];
  const groups = useMemo(() => groupActivityEntries(entries), [entries]);
  const hasActivity = (firstPage?.availableFilters.types.length ?? 0) > 0;
  const hasActiveFilter = filters.type !== undefined || filters.assetId !== undefined;
  const isUnauthorized =
    activityQuery.error instanceof ApiError && activityQuery.error.status === 401;

  const setType = (type: ActivityEntryType | undefined) => {
    setFilters((current) => ({
      ...(type !== undefined ? { type } : {}),
      ...(current.assetId !== undefined ? { assetId: current.assetId } : {}),
    }));
  };

  const setAsset = (assetId: string | undefined) => {
    setFilters((current) => ({
      ...(current.type !== undefined ? { type: current.type } : {}),
      ...(assetId !== undefined ? { assetId } : {}),
    }));
  };

  const clearFilters = () => setFilters({});

  return (
    <div className="hf hf-app ah-page">
      <HFTopBar />
      <main className="hf-main hf-shell ah-shell">
        <header className="hf-greeting">
          <div className="hf-greeting-text">
            <h1 className="hf-h1">History</h1>
            <div className="hf-greeting-sub">Actions across every asset in your fleet</div>
          </div>
        </header>

        {firstPage !== undefined && hasActivity && (
          <ActivityFiltersToolbar
            activeType={filters.type}
            activeAssetId={filters.assetId}
            typeFilters={firstPage.availableFilters.types}
            assetFilters={firstPage.availableFilters.assets}
            onTypeChange={setType}
            onAssetChange={setAsset}
            onClear={clearFilters}
          />
        )}

        {activityQuery.isPending ? (
          <ActivitySkeleton />
        ) : isUnauthorized ? (
          <ActivityState
            icon={<Icon name="lock" size={24} />}
            title="Redirecting to sign in"
            description="Your session is no longer active."
          />
        ) : activityQuery.isError ? (
          <ActivityState
            icon={<Icon name="alert" size={24} />}
            title="History could not be loaded"
            description={activityQuery.error.message || "Something went wrong on our end."}
            action={
              <button
                type="button"
                className="hf-btn hf-btn-primary"
                onClick={() => activityQuery.refetch()}
              >
                <Icon name="repeat" size={14} stroke={2} />
                Try again
              </button>
            }
          />
        ) : entries.length === 0 && hasActiveFilter ? (
          <ActivityState
            icon={<Icon name="filter" size={24} />}
            title="No matching activity"
            description="Your filters do not match any history entries."
            action={
              <button type="button" className="hf-btn hf-btn-primary" onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : entries.length === 0 ? (
          <ActivityState
            icon={<Icon name="clock" size={24} />}
            title="No activity yet"
            description="New assets, service records, and task changes will appear here."
            action={
              <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
                <Icon name="plus" size={14} stroke={2.2} />
                Add asset
              </Link>
            }
          />
        ) : (
          <>
            <ActivityFeed groups={groups} />
            {activityQuery.hasNextPage && (
              <div className="ah-load-more">
                <button
                  type="button"
                  className="hf-btn hf-btn-secondary"
                  disabled={activityQuery.isFetchingNextPage}
                  onClick={() => activityQuery.fetchNextPage()}
                >
                  <Icon name="clock-sm" size={14} />
                  {activityQuery.isFetchingNextPage ? "Loading..." : "Load older"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <HFBottomNav />
    </div>
  );
}
