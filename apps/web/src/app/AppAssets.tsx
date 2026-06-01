import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { assetsQueryKey, listAssets } from "../api/assets";
import { ApiError } from "../api/client";
import { Icon, type IconName } from "../design/Icon";
import { HFAssetThumb, type AssetCategory } from "../design/hf";
import { paths } from "../routes";
import { HFTopBar, HFBottomNav } from "./AppChrome";
import { type AssetPresentation, toAssetPresentation } from "./assetPresentation";

import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";

const HF_CAT_LABELS: Record<AssetCategory, string> = {
  vehicle: "Vehicle",
  equipment: "Equipment",
  property: "Property",
  lawn: "Grounds",
};

function HFAssetGridCard({ asset }: { asset: AssetPresentation }) {
  return (
    <article className="hf-asset-card hf-asset-card-static">
      <HFAssetThumb asset={asset} height={132} />
      <div className="hf-asset-body">
        <h3 className="hf-asset-card-name">{asset.name}</h3>
        <div className="hf-asset-card-meta">
          <span className="hf-mono" title={asset.id}>
            {asset.displayId}
          </span>
        </div>
      </div>
      <div className="hf-asset-summary">{asset.summary}</div>
    </article>
  );
}

function HFAssetRowCard({ asset }: { asset: AssetPresentation }) {
  return (
    <article className="hf-asset-row hf-asset-row-static">
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
        <div className="hf-asset-row-summary">{asset.summary}</div>
      </div>
    </article>
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

function HFAssetsToolbar({ assets }: { assets: AssetPresentation[] }) {
  const cats = [
    { id: "all", label: "All", count: assets.length },
    { id: "vehicle", label: "Vehicles", count: assets.filter((a) => a.cat === "vehicle").length },
    {
      id: "equipment",
      label: "Equipment",
      count: assets.filter((a) => a.cat === "equipment").length,
    },
    {
      id: "property",
      label: "Properties",
      count: assets.filter((a) => a.cat === "property").length,
    },
  ];
  const views: { id: "grid" | "list"; icon: IconName }[] = [
    { id: "grid", icon: "grid" },
    { id: "list", icon: "menu" },
  ];

  return (
    <div className="hf-assets-toolbar hf-assets-toolbar-disabled" aria-label="Asset controls">
      <div className="hf-search">
        <Icon name="search" size={15} color="var(--hf-ink-faint)" />
        <input className="hf-search-input" placeholder="Search assets" disabled />
      </div>
      <div className="hf-filter-chips">
        {cats.map((cat) => (
          <button key={cat.id} className={`hf-chip ${cat.id === "all" ? "active" : ""}`} disabled>
            {cat.label}
            <span className="hf-chip-count">{cat.count}</span>
          </button>
        ))}
      </div>
      <div className="hf-assets-toolbar-end">
        <div className="hf-view-toggle">
          {views.map((view) => (
            <button
              key={view.id}
              className={`hf-view-btn ${view.id === "grid" ? "active" : ""}`}
              title={`${view.id} view`}
              disabled
            >
              <Icon name={view.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HFAssetsHeader({ count }: { count: number }) {
  return (
    <div className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">Assets</h1>
        <div className="hf-greeting-sub">{count} things you take care of</div>
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

function HFAssetsState({
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

export function AppAssets() {
  const navigate = useNavigate();
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
    if (assetsQuery.error instanceof ApiError && assetsQuery.error.status === 401) {
      navigate(paths.login(), { replace: true });
    }
  }, [assetsQuery.error, navigate]);

  const assets = (assetsQuery.data?.assets ?? []).map(toAssetPresentation);

  return (
    <div className="hf hf-app hf-assets-page">
      <HFTopBar />
      <main className="hf-main hf-shell">
        <HFAssetsHeader count={assets.length} />
        <HFAssetsToolbar assets={assets} />

        {assetsQuery.isPending ? (
          <HFAssetsState title="Loading assets" description="Fetching your asset library..." />
        ) : assetsQuery.isError ? (
          <HFAssetsState
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
        ) : assets.length === 0 ? (
          <HFAssetsState
            title="No assets yet"
            description="Add your first vehicle, property, or piece of equipment."
            action={
              <Link className="hf-btn hf-btn-primary" to={paths.addAsset}>
                <Icon name="plus" size={14} stroke={2.2} />
                Add asset
              </Link>
            }
          />
        ) : (
          <>
            <div className="hf-asset-grid">
              {assets.map((asset) => (
                <HFAssetGridCard key={asset.id} asset={asset} />
              ))}
              <HFAddCard />
            </div>

            <div className="hf-asset-rows">
              {assets.map((asset) => (
                <HFAssetRowCard key={asset.id} asset={asset} />
              ))}
              <Link className="hf-row-add" to={paths.addAsset}>
                <Icon name="plus" size={16} stroke={2} />
                Add an asset
              </Link>
            </div>
          </>
        )}
      </main>
      <HFBottomNav />
    </div>
  );
}
