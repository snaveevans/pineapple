import { Icon, type IconName } from "../design/Icon";
import { HFAssetThumb, HFStatusPill, type AssetCategory, type AssetStatus } from "../design/hf";
import { HFTopBar, HFBottomNav } from "./AppChrome";

// FieldOps — Assets (card grid). The authenticated asset library: a header with
// fleet count + add button, a toolbar (search, category filter chips, grid/list
// view toggle), and a responsive grid of asset cards that collapses to stacked
// rows on mobile. Ported from the FieldOps design prototype (Assets.html /
// hifi-assets.jsx); styling comes from the shared .hf tokens in styles/hifi.css
// plus the .hf-asset-* scopes in styles/hifi-assets.css.
import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";

/* ============ data ============ */
interface Asset {
  id: string;
  name: string;
  cat: AssetCategory;
  icon: IconName;
  status: AssetStatus;
  next: string;
  due: string;
  loc: string;
  meter: string;
}

const HF_ASSETS_ALL: Asset[] = [
  { id: "TRK-04", name: "Ford F-150 · #4", cat: "vehicle", icon: "truck", status: "soon", next: "Oil change + tire rotation", due: "2 days", loc: "Lot · Main", meter: "48,210 mi" },
  { id: "VAN-02", name: "Sprinter Van · #2", cat: "vehicle", icon: "van", status: "ok", next: "Annual state inspection", due: "14 days", loc: "Lot · Main", meter: "82,400 mi" },
  { id: "TRL-01", name: "16ft Equipment Trailer", cat: "vehicle", icon: "truck", status: "ok", next: "Wheel bearing repack", due: "30 days", loc: "Lot · Back", meter: "—" },
  { id: "MOWER-A", name: "Toro ZTR Mower", cat: "equipment", icon: "mower", status: "overdue", next: "Blade sharpen + belt check", due: "3 days late", loc: "Shed B", meter: "312 hrs" },
  { id: "GEN-1", name: "Generac 22kW Generator", cat: "equipment", icon: "bolt", status: "ok", next: "Annual load test + oil", due: "21 days", loc: "12 Oak St", meter: "118 hrs" },
  { id: "PW-2", name: "Pressure Washer", cat: "equipment", icon: "wrench", status: "ok", next: "Pump oil change", due: "45 days", loc: "Shed A", meter: "84 hrs" },
  { id: "PROP-12", name: "12 Oak St", cat: "property", icon: "home", status: "soon", next: "Quarterly HVAC inspection", due: "5 days", loc: "Oak St", meter: "—" },
  { id: "PROP-48", name: "48 Elm Ave", cat: "property", icon: "home", status: "ok", next: "Gutter clean & inspect", due: "60 days", loc: "Elm Ave", meter: "—" },
  { id: "LAWN-A", name: "Riverside Lawn", cat: "lawn", icon: "leaf", status: "soon", next: "Spring fertilizer treatment", due: "9 days", loc: "Riverside", meter: "—" },
  { id: "LAWN-B", name: "Park Hedge Row", cat: "lawn", icon: "leaf", status: "ok", next: "Hedge trim & cleanup", due: "25 days", loc: "Park West", meter: "—" },
];

const HF_CAT_LABELS: Record<AssetCategory, string> = {
  vehicle: "Vehicle",
  equipment: "Equipment",
  property: "Property",
  lawn: "Grounds",
};

/* ============ grid card ============ */
function HFAssetGridCard({ asset }: { asset: Asset }) {
  return (
    <article className="hf-asset-card" data-status={asset.status} tabIndex={0}>
      <HFAssetThumb asset={asset} height={132} />
      <div className="hf-asset-body">
        <h3 className="hf-asset-card-name">{asset.name}</h3>
        <div className="hf-asset-card-meta">
          <span className="hf-mono">{asset.id}</span>
          {asset.meter !== "—" && (
            <>
              <span className="hf-dot-sep" />
              <span>{asset.meter}</span>
            </>
          )}
        </div>
      </div>
      <div className="hf-asset-footer">
        <div className="hf-asset-footer-text">
          <div className="hf-label-sm">Next</div>
          <div className="hf-asset-next">{asset.next}</div>
        </div>
        <HFStatusPill status={asset.status} due={asset.due} />
      </div>
    </article>
  );
}

/* horizontal row card — used on mobile */
function HFAssetRowCard({ asset }: { asset: Asset }) {
  return (
    <article className="hf-asset-row" data-status={asset.status} tabIndex={0}>
      <HFAssetThumb asset={asset} height={84} />
      <div className="hf-asset-row-body">
        <div className="hf-asset-row-top">
          <h3 className="hf-asset-card-name">{asset.name}</h3>
          <div className="hf-asset-card-meta">
            <span className="hf-mono">{asset.id}</span>
            <span className="hf-dot-sep" />
            <span>{HF_CAT_LABELS[asset.cat]}</span>
          </div>
        </div>
        <div className="hf-asset-row-bot">
          <div className="hf-asset-next-mobile">
            <span className="hf-label-sm">Next</span>
            <span className="hf-asset-next-text">{asset.next}</span>
          </div>
          <HFStatusPill status={asset.status} due={asset.due} />
        </div>
      </div>
    </article>
  );
}

/* ============ add-asset ghost card (slots into the grid) ============ */
function HFAddCard() {
  return (
    <article
      className="hf-asset-card hf-add-card"
      tabIndex={0}
      onClick={() => {
        window.location.href = "/app/assets/new";
      }}
    >
      <div className="hf-add-card-inner">
        <div className="hf-add-card-plus">
          <Icon name="plus" size={20} stroke={2} />
        </div>
        <div className="hf-add-card-label">Add an asset</div>
        <div className="hf-add-card-sub">Vehicle, equipment, property, grounds…</div>
      </div>
    </article>
  );
}

/* ============ toolbar: search + filter chips + view toggle ============ */
function HFAssetsToolbar({
  activeCat = "all",
  activeView = "grid",
}: {
  activeCat?: string;
  activeView?: "grid" | "list";
}) {
  const cats = [
    { id: "all", label: "All", count: HF_ASSETS_ALL.length },
    { id: "vehicle", label: "Vehicles", count: HF_ASSETS_ALL.filter((a) => a.cat === "vehicle").length },
    { id: "equipment", label: "Equipment", count: HF_ASSETS_ALL.filter((a) => a.cat === "equipment").length },
    { id: "property", label: "Properties", count: HF_ASSETS_ALL.filter((a) => a.cat === "property").length },
    { id: "lawn", label: "Grounds", count: HF_ASSETS_ALL.filter((a) => a.cat === "lawn").length },
  ];
  const views: { id: "grid" | "list"; icon: IconName }[] = [
    { id: "grid", icon: "grid" },
    { id: "list", icon: "menu" },
  ];
  return (
    <div className="hf-assets-toolbar">
      <div className="hf-search">
        <Icon name="search" size={15} color="var(--hf-ink-faint)" />
        <input className="hf-search-input" placeholder="Search assets, IDs, locations…" />
        <kbd className="hf-kbd">⌘ K</kbd>
      </div>
      <div className="hf-filter-chips">
        {cats.map((c) => (
          <button key={c.id} className={`hf-chip ${activeCat === c.id ? "active" : ""}`}>
            {c.label}
            <span className="hf-chip-count">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="hf-assets-toolbar-end">
        <div className="hf-view-toggle">
          {views.map((v) => (
            <button key={v.id} className={`hf-view-btn ${activeView === v.id ? "active" : ""}`} title={v.id}>
              <Icon name={v.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============ header ============ */
function HFAssetsHeader() {
  return (
    <div className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">Assets</h1>
        <div className="hf-greeting-sub">{HF_ASSETS_ALL.length} things you take care of</div>
      </div>
      <div className="hf-stats hf-stats-tight">
        <button
          className="hf-btn hf-btn-primary"
          onClick={() => {
            window.location.href = "/app/assets/new";
          }}
        >
          <Icon name="plus" size={14} stroke={2.2} />
          Add asset
        </button>
      </div>
    </div>
  );
}

/* ============ main: assets card grid (responsive) ============ */
export function AppAssets() {
  // The add-card slots in at the END of the grid so the "+" stays discoverable
  // inline; the stacked rows (mobile) get their own add button at the bottom.
  return (
    <div className="hf hf-app hf-assets-page">
      <HFTopBar activeNav="assets" />
      <main className="hf-main hf-shell">
        <HFAssetsHeader />
        <HFAssetsToolbar activeCat="all" activeView="grid" />

        <div className="hf-asset-grid">
          {HF_ASSETS_ALL.map((a) => (
            <HFAssetGridCard key={a.id} asset={a} />
          ))}
          <HFAddCard />
        </div>

        <div className="hf-asset-rows">
          {HF_ASSETS_ALL.map((a) => (
            <HFAssetRowCard key={a.id} asset={a} />
          ))}
          <button
            className="hf-row-add"
            onClick={() => {
              window.location.href = "/app/assets/new";
            }}
          >
            <Icon name="plus" size={16} stroke={2} />
            Add an asset
          </button>
        </div>
      </main>
      <HFBottomNav activeNav="assets" />
    </div>
  );
}
