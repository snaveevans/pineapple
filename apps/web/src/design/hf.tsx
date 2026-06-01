import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

// Shared design-system primitives reused by the marketing hero collage,
// ported from the FieldOps app (hifi.jsx / hifi-assets.jsx). Styling comes
// from styles/hifi.css + styles/hifi-assets.css.

export type AssetStatus = "overdue" | "soon" | "ok";
export type AssetCategory = "vehicle" | "equipment" | "property" | "lawn";

const CAT_TINTS: Record<AssetCategory, string> = {
  vehicle: "var(--hf-tint-vehicle)",
  equipment: "var(--hf-tint-equip)",
  property: "var(--hf-tint-prop)",
  lawn: "var(--hf-tint-lawn)",
};

const CAT_LABELS: Record<AssetCategory, string> = {
  vehicle: "Vehicle",
  equipment: "Equipment",
  property: "Property",
  lawn: "Grounds",
};

const PILL_CONFIG: Record<AssetStatus, { label: string; cls: string; icon: IconName }> = {
  overdue: { label: "Overdue", cls: "hf-pill hf-pill-bad", icon: "alert" },
  soon: { label: "Due soon", cls: "hf-pill hf-pill-warn", icon: "clock-sm" },
  ok: { label: "On track", cls: "hf-pill hf-pill-ok", icon: "check" },
};

export function HFStatusPill({ status, due }: { status: AssetStatus; due?: string }) {
  const cfg = PILL_CONFIG[status];
  return (
    <span className={cfg.cls}>
      <Icon name={cfg.icon} size={12} stroke={2} />
      {due ?? cfg.label}
    </span>
  );
}

export function HFAssetIcon({
  asset,
  size = 40,
}: {
  asset: { category: AssetCategory; icon: IconName };
  size?: number;
}) {
  const style: CSSProperties = { width: size, height: size, background: CAT_TINTS[asset.category] };
  return (
    <div className="hf-asset-icon" style={style}>
      <Icon name={asset.icon} size={size * 0.55} stroke={1.6} />
    </div>
  );
}

export function HFAssetThumb({
  asset,
  height = 132,
}: {
  asset: { cat: AssetCategory; icon: IconName; status?: AssetStatus };
  height?: number;
}) {
  return (
    <div className="hf-asset-thumb" data-cat={asset.cat} style={{ height }}>
      <div className="hf-asset-thumb-icon">
        <Icon name={asset.icon} size={Math.round(height * 0.36)} stroke={1.4} />
      </div>
      <span className="hf-asset-cat-badge">{CAT_LABELS[asset.cat]}</span>
      {asset.status && <span className="hf-asset-status-dot" data-status={asset.status} />}
    </div>
  );
}
