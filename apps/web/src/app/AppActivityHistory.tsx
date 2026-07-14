import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  activityQueryKey,
  listActivity,
  type ActivityAssetFilter,
  type ActivityEntry,
  type ActivityEntryType,
  type ActivityFilters,
  type ActivityTypeFilter,
} from "../api/activity.ts";
import { ApiError } from "../api/client.ts";
import { Icon, type IconName } from "../design/Icon.tsx";
import { HFAssetIcon } from "../design/hf.tsx";
import { paths } from "../routes.ts";
import { HFBottomNav, HFTopBar } from "./AppChrome.tsx";
import { activityActorLabel } from "./activityPresentation.ts";
import { assetTypeLabel } from "./assetPresentation.ts";
import { dateKey, formatMonthDay, formatShortDate, ymdToUTC } from "./dateFormat.ts";

import "../design/styles/hifi.css";
import "./styles/activity-history.css";

const PAGE_SIZE = 25;
const DAY_MS = 86_400_000;

const TYPE_ORDER: ActivityEntryType[] = [
  "maintenance_logged",
  "task_completed",
  "task_scheduled",
  "asset_added",
  "task_deleted",
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type ActivityTypeConfig = {
  icon: IconName;
  verb: string;
  label: string;
  color: string;
};

const TYPE_CONFIG: Record<ActivityEntryType, ActivityTypeConfig> = {
  maintenance_logged: {
    icon: "wrench",
    verb: "Logged maintenance",
    label: "Maintenance logged",
    color: "var(--hh-maint)",
  },
  task_completed: {
    icon: "check",
    verb: "Completed task",
    label: "Tasks completed",
    color: "var(--hh-completed)",
  },
  task_scheduled: {
    icon: "calendar",
    verb: "Scheduled task",
    label: "Tasks scheduled",
    color: "var(--hh-scheduled)",
  },
  asset_added: {
    icon: "plus",
    verb: "Added asset",
    label: "Assets added",
    color: "var(--hh-added)",
  },
  task_deleted: {
    icon: "x",
    verb: "Removed task",
    label: "Tasks removed",
    color: "var(--hh-deleted)",
  },
};

type TypeCounts = Record<ActivityEntryType, number>;

type ActivityGroup = {
  key: string;
  date: Date;
  entries: ActivityEntry[];
};

function emptyTypeCounts(): TypeCounts {
  return {
    asset_added: 0,
    maintenance_logged: 0,
    task_completed: 0,
    task_scheduled: 0,
    task_deleted: 0,
  };
}

function buildTypeCounts(filters: ActivityTypeFilter[]): TypeCounts {
  const counts = emptyTypeCounts();
  for (const filter of filters) counts[filter.type] = filter.count;
  return counts;
}

function totalActivity(counts: TypeCounts): number {
  return TYPE_ORDER.reduce((sum, type) => sum + counts[type], 0);
}

function sortAssetFilters(filters: ActivityAssetFilter[]): ActivityAssetFilter[] {
  return [...filters].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.asset.name.localeCompare(b.asset.name);
  });
}

function filterLoadedEntries(entries: ActivityEntry[], query: string): ActivityEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    [entry.title, entry.asset.name]
      .filter((value): value is string => value !== undefined)
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function groupEntries(entries: ActivityEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: ActivityGroup | null = null;

  for (const entry of entries) {
    const date = new Date(entry.occurredAt);
    const key = dateKey(entry.occurredAt);
    if (current === null || current.key !== key) {
      current = { key, date, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }

  return groups;
}

function daysBetween(todayKey: string, entryKey: string): number {
  return Math.round((ymdToUTC(todayKey) - ymdToUTC(entryKey)) / DAY_MS);
}

function clockLabel(date: Date): string {
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function relativeLabel(occurredAt: string, now: Date): string {
  const occurred = new Date(occurredAt);
  const todayKey = dateKey(now.toISOString());
  const entryKey = dateKey(occurredAt);
  const dayDiff = daysBetween(todayKey, entryKey);
  const msDiff = Math.max(0, now.getTime() - occurred.getTime());

  if (dayDiff === 0) {
    const hours = Math.floor(msDiff / 3_600_000);
    if (hours < 1) {
      const minutes = Math.max(1, Math.floor(msDiff / 60_000));
      return `${minutes}m ago`;
    }
    return `${hours}h ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;
  return formatMonthDay(entryKey);
}

function dayLabel(date: Date, now: Date): string {
  const todayKey = dateKey(now.toISOString());
  const entryKey = dateKey(date.toISOString());
  const dayDiff = daysBetween(todayKey, entryKey);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return WEEKDAYS[date.getUTCDay()]!;
  return formatMonthDay(entryKey);
}

function assetIcon(asset: ActivityEntry["asset"]): {
  category: ActivityEntry["asset"]["type"];
  icon: IconName;
} {
  const name = asset.name.toLowerCase();
  if (asset.type === "vehicle") {
    return {
      category: asset.type,
      icon: name.includes("van") || name.includes("sprinter") ? "van" : "truck",
    };
  }
  if (asset.type === "property") {
    return {
      category: asset.type,
      icon: name.includes("lawn") || name.includes("yard") ? "leaf" : "home",
    };
  }
  if (name.includes("mower")) return { category: asset.type, icon: "mower" };
  if (name.includes("generator") || name.includes("generac")) {
    return { category: asset.type, icon: "bolt" };
  }
  return { category: asset.type, icon: "wrench" };
}

function ActivityHeader({
  total,
  assetsInvolved,
}: {
  total: number | string;
  assetsInvolved: number | string;
}) {
  return (
    <header className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">History</h1>
        <div className="hf-greeting-sub">
          Everything you&apos;ve done across your fleet, newest first
        </div>
      </div>
      <div className="hf-stats">
        <div className="hf-stat">
          <div className="hf-stat-val">{total}</div>
          <div className="hf-stat-lbl">Actions, all time</div>
        </div>
        <div className="hf-stat">
          <div className="hf-stat-val">{assetsInvolved}</div>
          <div className="hf-stat-lbl">Assets involved</div>
        </div>
      </div>
    </header>
  );
}

function ActivityFiltersToolbar({
  activeType,
  activeAssetId,
  searchQuery,
  typeCounts,
  total,
  assetFilters,
  onTypeChange,
  onAssetChange,
  onSearchChange,
}: {
  activeType: ActivityEntryType | undefined;
  activeAssetId: string | undefined;
  searchQuery: string;
  typeCounts: TypeCounts;
  total: number;
  assetFilters: ActivityAssetFilter[];
  onTypeChange: (type: ActivityEntryType | undefined) => void;
  onAssetChange: (assetId: string | undefined) => void;
  onSearchChange: (query: string) => void;
}) {
  return (
    <div className="hh-toolbar">
      <div className="hf-filter-chips" role="group" aria-label="Filter history by activity type">
        <button
          type="button"
          className={`hf-chip ${activeType === undefined ? "active" : ""}`}
          aria-pressed={activeType === undefined}
          onClick={() => onTypeChange(undefined)}
        >
          All
          <span className="hf-chip-count">{total}</span>
        </button>
        {TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            className={`hf-chip ${activeType === type ? "active" : ""}`}
            aria-pressed={activeType === type}
            onClick={() => onTypeChange(type)}
          >
            {TYPE_CONFIG[type].label}
            <span className="hf-chip-count">{typeCounts[type]}</span>
          </button>
        ))}
      </div>
      <div className="hh-toolbar-end">
        <label className="hh-search">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="Search loaded history..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>
        <select
          className="hh-select"
          aria-label="Filter by asset"
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
      </div>
    </div>
  );
}

function ActivityState({
  icon,
  title,
  description,
  action,
  spinner = false,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  spinner?: boolean;
}) {
  return (
    <div className="hh-state">
      {spinner ? (
        <span className="hh-spinner" />
      ) : (
        <div className="hh-state-icon">
          <Icon name={icon ?? "clock"} size={24} stroke={1.8} />
        </div>
      )}
      <div className="hh-state-title">{title}</div>
      {description !== undefined && <div className="hh-state-sub">{description}</div>}
      {action}
    </div>
  );
}

function ActivityAssetChip({ asset }: { asset: ActivityEntry["asset"] }) {
  return (
    <Link
      className="hh-asset-chip"
      to={paths.assetMaintenance(asset.id)}
      title={`Open ${asset.name}`}
    >
      <HFAssetIcon asset={assetIcon(asset)} size={22} />
      <span className="hh-asset-chip-name">{asset.name}</span>
    </Link>
  );
}

function PerformedFact({ entry, color }: { entry: ActivityEntry; color: string }) {
  if (entry.performedAt === undefined) return null;
  return (
    <div className="hh-facts">
      <span className="hh-fact">
        <Icon name="check" size={12} color={color} stroke={2.2} />
        Performed <b>{formatShortDate(entry.performedAt)}</b>
      </span>
    </div>
  );
}

function ActivityEventCard({
  entry,
  now,
  viewerUserId,
}: {
  entry: ActivityEntry;
  now: Date;
  viewerUserId: string;
}) {
  const config = TYPE_CONFIG[entry.type];
  const occurredAt = new Date(entry.occurredAt);
  const title = entry.title ?? "Untitled activity";
  const actorLabel = activityActorLabel(entry.actor, viewerUserId);

  let headline: ReactNode;
  let detail: ReactNode = null;

  switch (entry.type) {
    case "maintenance_logged":
      headline = <h3 className="hh-title">{title}</h3>;
      detail = (
        <div className="hh-detail">
          <PerformedFact entry={entry} color="var(--hh-maint)" />
        </div>
      );
      break;
    case "asset_added":
      headline = (
        <h3 className="hh-title">
          Added <span className="hh-strong">{entry.asset.name}</span> to your fleet
        </h3>
      );
      break;
    case "task_scheduled":
      headline = <h3 className="hh-title">{title}</h3>;
      detail = (
        <div className="hh-detail">
          <div className="hh-link-line">
            <Icon name="info" size={13} color="var(--hf-ink-faint)" />
            New recurring task scheduled
          </div>
        </div>
      );
      break;
    case "task_completed":
      headline = <h3 className="hh-title">{title}</h3>;
      detail = (
        <div className="hh-detail">
          <PerformedFact entry={entry} color={config.color} />
          <div className="hh-link-line">
            <Icon name="repeat" size={13} color="var(--hf-ink-faint)" />
            Completed a scheduled task
          </div>
        </div>
      );
      break;
    case "task_deleted":
      headline = (
        <h3 className="hh-title">
          Removed <span className="hh-strong">{title}</span>
        </h3>
      );
      detail = (
        <div className="hh-detail">
          <div className="hh-link-line">
            <Icon name="info" size={13} color="var(--hf-ink-faint)" />
            Linked maintenance records were kept
          </div>
        </div>
      );
      break;
  }

  return (
    <article className="hh-event">
      <div className="hh-node" data-type={entry.type}>
        <Icon name={config.icon} size={18} stroke={2} />
      </div>
      <div className="hh-card">
        <div className="hh-card-head">
          <div className="hh-card-headline">
            <span className="hh-verb" data-type={entry.type}>
              <Icon name={config.icon} size={11} stroke={2.2} />
              {config.verb}
            </span>
            {headline}
            <span className="hh-actor" title={actorLabel === "You" ? "You" : actorLabel}>
              {actorLabel === "You" ? "by you" : `by ${actorLabel}`}
            </span>
          </div>
          <div className="hh-time">
            <span className="hh-time-rel">{relativeLabel(entry.occurredAt, now)}</span>
            <span className="hh-time-abs">{clockLabel(occurredAt)}</span>
          </div>
        </div>
        {detail}
        <ActivityAssetChip asset={entry.asset} />
      </div>
    </article>
  );
}

function ActivityTimeline({
  groups,
  now,
  viewerUserId,
}: {
  groups: ActivityGroup[];
  now: Date;
  viewerUserId: string;
}) {
  return (
    <div className="hh-timeline">
      {groups.map((group) => (
        <section
          className="hh-daygroup"
          key={group.key}
          aria-labelledby={`activity-day-${group.key}`}
        >
          <div id={`activity-day-${group.key}`} className="hh-day-label">
            <span className="hh-day-name">{dayLabel(group.date, now)}</span>
            <span className="hh-day-rel">
              {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {group.entries.map((entry) => (
            <ActivityEventCard
              key={entry.id}
              entry={entry}
              now={now}
              viewerUserId={viewerUserId}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ActivityBreakdown({ typeCounts }: { typeCounts: TypeCounts }) {
  const max = Math.max(...TYPE_ORDER.map((type) => typeCounts[type]));
  return (
    <div className="hh-panel">
      <div className="hh-panel-head">
        <h2 className="hh-panel-title">Activity breakdown</h2>
        <span className="hh-panel-meta">all time</span>
      </div>
      <div className="hh-breakdown">
        {TYPE_ORDER.map((type) => {
          const count = typeCounts[type];
          const config = TYPE_CONFIG[type];
          return (
            <div className="hh-bd-row" key={type}>
              <span className="hh-bd-label">
                <span className="hh-bd-swatch" style={{ background: config.color }} />
                {config.label}
              </span>
              <span className="hh-bd-count">{count}</span>
              <div className="hh-bd-track">
                <div
                  className="hh-bd-fill"
                  style={{
                    width: `${max > 0 ? (count / max) * 100 : 0}%`,
                    background: config.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MostActiveAsset({ assetFilters }: { assetFilters: ActivityAssetFilter[] }) {
  const top = assetFilters[0];
  if (top === undefined) return null;
  return (
    <div className="hh-panel">
      <div className="hh-panel-head">
        <h2 className="hh-panel-title">Most active asset</h2>
      </div>
      <div className="hh-active-asset">
        <HFAssetIcon asset={assetIcon(top.asset)} size={38} />
        <div className="hh-active-text">
          <div className="hh-active-name">{top.asset.name}</div>
          <div className="hh-active-sub">
            {top.count} {top.count === 1 ? "activity" : "activities"} logged
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppActivityHistory() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ActivityFilters>({});
  const [searchQuery, setSearchQuery] = useState("");

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
  const typeCounts = useMemo(
    () => buildTypeCounts(firstPage?.availableFilters.types ?? []),
    [firstPage],
  );
  const assetFilters = useMemo(
    () => sortAssetFilters(firstPage?.availableFilters.assets ?? []),
    [firstPage],
  );
  const total = totalActivity(typeCounts);
  const shownEntries = useMemo(
    () => filterLoadedEntries(entries, searchQuery),
    [entries, searchQuery],
  );
  const groups = useMemo(() => groupEntries(shownEntries), [shownEntries]);
  const now = useMemo(() => new Date(), [activityQuery.dataUpdatedAt]);
  const hasActivity = total > 0;
  const hasActiveFilter =
    filters.type !== undefined || filters.assetId !== undefined || searchQuery.trim() !== "";
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

  const clearFilters = () => {
    setFilters({});
    setSearchQuery("");
  };

  let body: ReactNode;
  if (activityQuery.isPending) {
    body = <ActivityState spinner title="Loading your history..." />;
  } else if (isUnauthorized) {
    body = (
      <ActivityState
        icon="lock"
        title="Redirecting to sign in"
        description="Your session is no longer active."
      />
    );
  } else if (activityQuery.isError) {
    body = (
      <ActivityState
        icon="alert"
        title="History could not be loaded"
        description="Something went wrong on our end. Check your connection and try again."
        action={
          <button
            type="button"
            className="hf-btn hf-btn-primary"
            onClick={() => void activityQuery.refetch()}
          >
            <Icon name="repeat" size={14} stroke={2} />
            Try again
          </button>
        }
      />
    );
  } else if (!hasActivity) {
    body = (
      <ActivityState
        icon="clock"
        title="Nothing here yet"
        description="As you add assets and log maintenance, every action shows up here as a running history."
      />
    );
  } else if (shownEntries.length === 0) {
    body = (
      <ActivityState
        icon={searchQuery.trim() ? "search" : "filter"}
        title="No matching activity"
        description="No history matches your current filters. Try clearing the search or switching back to All."
        action={
          hasActiveFilter ? (
            <button type="button" className="hf-btn hf-btn-primary" onClick={clearFilters}>
              Clear filters
            </button>
          ) : undefined
        }
      />
    );
  } else {
    const viewerUserId = firstPage?.viewerUserId ?? "";
    body = (
      <div className="hh-grid">
        <div>
          <ActivityTimeline groups={groups} now={now} viewerUserId={viewerUserId} />
          <div className="hh-loadmore">
            {activityQuery.hasNextPage ? (
              <button
                type="button"
                className="hh-loadmore-btn"
                disabled={activityQuery.isFetchingNextPage}
                onClick={() => void activityQuery.fetchNextPage()}
              >
                <Icon name="chevron-down" size={14} stroke={2} />
                {activityQuery.isFetchingNextPage
                  ? "Loading older activity"
                  : "Load older activity"}
              </button>
            ) : (
              <span className="hh-loadmore-end">
                You&apos;ve reached the beginning of your history
              </span>
            )}
          </div>
        </div>
        <aside className="hh-rail">
          <ActivityBreakdown typeCounts={typeCounts} />
          <MostActiveAsset assetFilters={assetFilters} />
        </aside>
      </div>
    );
  }

  return (
    <div className="hf hf-app hh">
      <HFTopBar />
      <main className="hf-main hf-shell">
        <ActivityHeader
          total={firstPage !== undefined ? total : "..."}
          assetsInvolved={firstPage !== undefined ? assetFilters.length : "..."}
        />

        {firstPage !== undefined && hasActivity && (
          <ActivityFiltersToolbar
            activeType={filters.type}
            activeAssetId={filters.assetId}
            searchQuery={searchQuery}
            typeCounts={typeCounts}
            total={total}
            assetFilters={assetFilters}
            onTypeChange={setType}
            onAssetChange={setAsset}
            onSearchChange={setSearchQuery}
          />
        )}

        {body}
      </main>
      <HFBottomNav />
    </div>
  );
}
