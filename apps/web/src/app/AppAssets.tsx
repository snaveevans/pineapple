import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { assetsQueryKey, listAssets, type AssetCategoryCounts } from "../api/assets";
import { ApiError } from "../api/client";
import { Icon, type IconName } from "../design/Icon";
import { HFAssetThumb, type AssetCategory } from "../design/hf";
import { paths } from "../routes";
import { HFTopBar, HFBottomNav } from "./AppChrome";
import { type AssetPresentation, toAssetPresentation } from "./assetPresentation";
import {
  ASSET_VIEW_STORAGE_KEY,
  assetCountCopy,
  assetFilterLabel,
  assetFilterOptions,
  assetViewFromStorage,
  filterAssets,
  type AssetFilter,
  type AssetView,
} from "./assetLibraryPresentation";

import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";

const HF_CAT_LABELS: Record<AssetCategory, string> = {
  vehicle: "Vehicle",
  equipment: "Equipment",
  property: "Property",
  lawn: "Grounds",
};

const ASSET_MOBILE_BREAKPOINT = 580;

function useMobileAssetLayout(pageRef: RefObject<HTMLDivElement | null>): boolean {
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (page === null) return;

    const update = () => setIsMobileLayout(page.clientWidth <= ASSET_MOBILE_BREAKPOINT);
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(page);
    return () => observer.disconnect();
  }, [pageRef]);

  return isMobileLayout;
}

function HFAssetGridCard({ asset }: { asset: AssetPresentation }) {
  return (
    <Link to={paths.assetMaintenance(asset.id)} className="hf-asset-card">
      <HFAssetThumb asset={asset} height={132} />
      <div className="hf-asset-body">
        <h3 className="hf-asset-card-name">{asset.name}</h3>
        <div className="hf-asset-card-meta">
          <span className="hf-mono" title={asset.id}>
            {asset.displayId}
          </span>
        </div>
      </div>
      <div className="hf-asset-footer">
        <div className="hf-asset-footer-text">
          <div className="hf-asset-summary">{asset.summary}</div>
        </div>
      </div>
    </Link>
  );
}

function HFAssetRowCard({ asset }: { asset: AssetPresentation }) {
  return (
    <Link to={paths.assetMaintenance(asset.id)} className="hf-asset-row">
      <HFAssetThumb asset={asset} height={84} />
      <div className="hf-asset-row-body">
        <div className="hf-asset-row-top">
          <h3 className="hf-asset-card-name">{asset.name}</h3>
          <div className="hf-asset-card-meta">
            <span className="hf-mono" title={asset.id}>
              {asset.displayId}
            </span>
            <span className="hf-dot-sep" />
            <span>{HF_CAT_LABELS[asset.cat]}</span>
          </div>
        </div>
        <div className="hf-asset-row-bot">
          <div className="hf-asset-summary hf-asset-summary-row">{asset.summary}</div>
        </div>
      </div>
      <span className="hf-asset-row-go">
        <Icon name="chevron-right" size={18} color="var(--hf-ink-faint)" />
      </span>
    </Link>
  );
}

function HFAddCard() {
  return (
    <Link to={paths.addAsset} className="hf-asset-card hf-add-card">
      <div className="hf-add-card-inner">
        <div className="hf-add-card-plus">
          <Icon name="plus" size={20} stroke={2} />
        </div>
        <div className="hf-add-card-label">Add an asset</div>
        <div className="hf-add-card-sub">Vehicle, equipment, or property</div>
      </div>
    </Link>
  );
}

function HFAssetsToolbar({
  activeFilter,
  activeView,
  counts,
  onFilter,
  onView,
}: {
  activeFilter: AssetFilter;
  activeView: AssetView;
  counts: AssetCategoryCounts;
  onFilter: (filter: AssetFilter) => void;
  onView: (view: AssetView) => void;
}) {
  const categories = assetFilterOptions(counts);
  const views: { id: "grid" | "list"; icon: IconName }[] = [
    { id: "grid", icon: "grid" },
    { id: "list", icon: "menu" },
  ];

  return (
    <div className="hf-assets-toolbar">
      <div className="hf-filter-chips" role="group" aria-label="Filter assets by category">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`hf-chip ${activeFilter === category.id ? "active" : ""}`}
            aria-pressed={activeFilter === category.id}
            onClick={() => onFilter(category.id)}
          >
            {category.label}
            <span className="hf-chip-count">{category.count}</span>
          </button>
        ))}
      </div>
      <div className="hf-assets-toolbar-end">
        <div className="hf-view-toggle">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`hf-view-btn ${activeView === view.id ? "active" : ""}`}
              aria-pressed={activeView === view.id}
              aria-label={`${view.id === "grid" ? "Grid" : "List"} view`}
              title={`${view.id === "grid" ? "Grid" : "List"} view`}
              onClick={() => onView(view.id)}
            >
              <Icon name={view.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HFAssetsHeader({ count, showCount }: { count: number; showCount: boolean }) {
  return (
    <div className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">Assets</h1>
        {showCount && <div className="hf-greeting-sub">{assetCountCopy(count)}</div>}
      </div>
      <div className="hf-stats hf-stats-tight">
        <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
          <Icon name="plus" size={14} stroke={2.2} />
          Add asset
        </Link>
      </div>
    </div>
  );
}

function HFAssetsLoading() {
  return (
    <div className="hf-assets-state" role="status">
      <span className="hf-assets-spinner" />
      <div className="hf-assets-state-title">Loading assets</div>
    </div>
  );
}

function HFAssetsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="hf-assets-state">
      <div className="hf-assets-state-icon" data-tone="bad">
        <Icon name="alert" size={26} stroke={1.8} />
      </div>
      <div className="hf-assets-state-title">Assets could not be loaded</div>
      <div className="hf-assets-state-sub">{message || "Something went wrong on our end."}</div>
      <button type="button" className="hf-btn hf-btn-primary" onClick={onRetry}>
        <Icon name="repeat" size={14} stroke={2} />
        Try again
      </button>
    </div>
  );
}

function HFAssetsRedirecting() {
  return (
    <div className="hf-assets-state" role="status">
      <span className="hf-assets-spinner" />
      <div className="hf-assets-state-title">Redirecting to sign in</div>
    </div>
  );
}

function HFAssetsEmpty() {
  return (
    <div className="hf-assets-state">
      <div className="hf-assets-state-icon">
        <Icon name="plus" size={26} stroke={2} />
      </div>
      <div className="hf-assets-state-title">No assets yet</div>
      <div className="hf-assets-state-sub">
        Add your trucks, equipment, and properties to start tracking maintenance in one place.
      </div>
      <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
        <Icon name="plus" size={14} stroke={2.2} />
        Add asset
      </Link>
    </div>
  );
}

function HFAssetsFilteredEmpty({ category, onClear }: { category: string; onClear: () => void }) {
  return (
    <div className="hf-assets-state hf-assets-state-inline">
      <div className="hf-assets-state-icon">
        <Icon name="filter" size={24} stroke={1.8} />
      </div>
      <div className="hf-assets-state-title">No {category.toLowerCase()} yet</div>
      <div className="hf-assets-state-sub">You don't have any assets in this category.</div>
      <div className="hf-assets-state-actions">
        <button type="button" className="hf-btn hf-btn-ghost" onClick={onClear}>
          Clear filter
        </button>
        <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
          <Icon name="plus" size={14} stroke={2.2} />
          Add asset
        </Link>
      </div>
    </div>
  );
}

export function AppAssets() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<AssetFilter>("all");
  const [view, setView] = useState<AssetView>(() => {
    try {
      return assetViewFromStorage(window.localStorage.getItem(ASSET_VIEW_STORAGE_KEY));
    } catch {
      return "grid";
    }
  });
  const persistedView = useRef(view);
  const isMobileLayout = useMobileAssetLayout(pageRef);
  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: listAssets,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  useEffect(() => {
    document.title = "FieldOps - Assets";
  }, []);

  useEffect(() => {
    if (persistedView.current === view) return;
    try {
      window.localStorage.setItem(ASSET_VIEW_STORAGE_KEY, view);
      persistedView.current = view;
    } catch {
      // Persisting a visual preference is optional (for example, private browsing may reject it).
    }
  }, [view]);

  useEffect(() => {
    if (assetsQuery.error instanceof ApiError && assetsQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [assetsQuery.error, navigate]);

  const sourceAssets = assetsQuery.data?.assets;
  const assets = useMemo(() => (sourceAssets ?? []).map(toAssetPresentation), [sourceAssets]);
  const counts = assetsQuery.data?.counts;
  const shownAssets = useMemo(() => filterAssets(assets, activeFilter), [assets, activeFilter]);
  const isUnauthorized = assetsQuery.error instanceof ApiError && assetsQuery.error.status === 401;
  const hasAssets = assets.length > 0;
  const showToolbar = !assetsQuery.isPending && !assetsQuery.isError && hasAssets && counts !== undefined;
  const showRows = isMobileLayout || view === "list";

  const retryAssets = () => {
    setActiveFilter("all");
    void assetsQuery.refetch();
  };

  return (
    <div ref={pageRef} className="hf hf-app hf-assets-page" data-view={view}>
      <HFTopBar />
      <main className="hf-main hf-shell">
        <HFAssetsHeader count={counts?.all ?? 0} showCount={!assetsQuery.isPending && !assetsQuery.isError} />
        {showToolbar && (
          <HFAssetsToolbar
            activeFilter={activeFilter}
            activeView={view}
            counts={counts}
            onFilter={setActiveFilter}
            onView={setView}
          />
        )}

        {assetsQuery.isPending ? (
          <HFAssetsLoading />
        ) : isUnauthorized ? (
          <HFAssetsRedirecting />
        ) : assetsQuery.isError ? (
          <HFAssetsError message={assetsQuery.error.message} onRetry={retryAssets} />
        ) : !hasAssets ? (
          <HFAssetsEmpty />
        ) : shownAssets.length === 0 ? (
          <HFAssetsFilteredEmpty
            category={assetFilterLabel(activeFilter)}
            onClear={() => setActiveFilter("all")}
          />
        ) : (
          showRows ? (
            <div className="hf-asset-rows">
              {shownAssets.map((asset) => (
                <HFAssetRowCard key={asset.id} asset={asset} />
              ))}
              <Link className="hf-row-add" to={paths.addAsset}>
                <Icon name="plus" size={16} stroke={2} />
                Add an asset
              </Link>
            </div>
          ) : (
            <div className="hf-asset-grid">
              {shownAssets.map((asset) => (
                <HFAssetGridCard key={asset.id} asset={asset} />
              ))}
              <HFAddCard />
            </div>
          )
        )}
      </main>
      <HFBottomNav />
    </div>
  );
}
