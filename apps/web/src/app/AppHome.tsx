import { useEffect, useState } from "react";
import { Icon, type IconName } from "../design/Icon";
import { HFAssetIcon, HFStatusPill, type AssetCategory, type AssetStatus } from "../design/hf";
import { HFTopBar, HFBottomNav } from "./AppChrome";

// FieldOps — Home (Master / Detail). The authenticated app shell: a top bar,
// greeting + fleet stats, category filters, and a master/detail grid (detail
// card on the left, urgency-sorted queue on the right). On mobile the detail
// card collapses and the selected queue row expands inline. Ported from the
// FieldOps design prototype (Master Detail.html / hifi.jsx); styling comes from
// the shared .hf tokens in styles/hifi.css.
import "../design/styles/hifi.css";

/* ============ data ============ */
interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  icon: IconName;
  service: string;
  due: string;
  dueDays: number;
  status: AssetStatus;
  last: string;
  meter: string;
  recurs: string;
  est: string;
  where: string;
  notes: string;
  assignee: string;
}

const HF_ASSETS: Asset[] = [
  {
    id: "MOWER-A",
    name: "Toro ZTR Mower",
    category: "equipment",
    icon: "mower",
    service: "Blade sharpen + belt check",
    due: "Overdue · 3 days",
    dueDays: -3,
    status: "overdue",
    last: "Apr 02",
    meter: "312 hrs",
    recurs: "Every 50 hrs",
    est: "45 min",
    where: "Shed B",
    notes:
      "Belt was squealing on the last run. Sharpen both blades while you're in there.",
    assignee: "Self",
  },
  {
    id: "TRK-04",
    name: "Ford F-150 · Truck #4",
    category: "vehicle",
    icon: "truck",
    service: "Oil change + tire rotation",
    due: "In 2 days",
    dueDays: 2,
    status: "soon",
    last: "Feb 14",
    meter: "48,210 mi",
    recurs: "Every 5,000 mi",
    est: "30 min",
    where: "Joe's Auto",
    notes: "Front-left tire wearing fast — flag it for replacement next cycle.",
    assignee: "Joe's Auto",
  },
  {
    id: "PROP-12",
    name: "12 Oak St · HVAC",
    category: "property",
    icon: "home",
    service: "Quarterly HVAC inspection",
    due: "In 5 days",
    dueDays: 5,
    status: "soon",
    last: "Feb 22",
    meter: "—",
    recurs: "Quarterly",
    est: "1 hr",
    where: "On-site visit",
    notes:
      "Filter sizes: 16×25×1. Tenant prefers morning appointments — text before heading out.",
    assignee: "Mike R.",
  },
  {
    id: "LAWN-A",
    name: "Riverside Lawn",
    category: "lawn",
    icon: "leaf",
    service: "Spring fertilizer treatment",
    due: "In 9 days",
    dueDays: 9,
    status: "ok",
    last: "Mar 11",
    meter: "—",
    recurs: "Spring + Fall",
    est: "2 hrs",
    where: "Riverside",
    notes: "Slow-release N. Avoid the day before or of forecasted rain.",
    assignee: "Self",
  },
  {
    id: "VAN-02",
    name: "Sprinter Van #2",
    category: "vehicle",
    icon: "van",
    service: "Annual state safety inspection",
    due: "In 14 days",
    dueDays: 14,
    status: "ok",
    last: "Nov 20",
    meter: "82,400 mi",
    recurs: "Annual",
    est: "1 hr",
    where: "DMV-cert shop",
    notes: "Inspection sticker expires end of the month — don't let it lapse.",
    assignee: "Joe's Auto",
  },
  {
    id: "GEN-1",
    name: "Generac 22kW Genny",
    category: "equipment",
    icon: "bolt",
    service: "Annual load test + oil",
    due: "In 21 days",
    dueDays: 21,
    status: "ok",
    last: "May 03 ’25",
    meter: "118 hrs",
    recurs: "Annual",
    est: "2 hrs",
    where: "On-site",
    notes: "Coordinate with tenants — there's a ~30 min power dip during the test.",
    assignee: "Self",
  },
];

/* ============ detail body (shared by hero card + inline expand) ============ */
function HFDetailBody({
  asset,
  compact = false,
  isNextUp = false,
}: {
  asset: Asset;
  compact?: boolean;
  isNextUp?: boolean;
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
            <HFStatusPill status={asset.status} due={asset.due} />
          </div>
          <div className="hf-asset-row">
            <HFAssetIcon asset={asset} size={56} />
            <div className="hf-asset-id">
              <h2 className="hf-asset-name">{asset.name}</h2>
              <div className="hf-asset-meta">
                <span className="hf-mono">{asset.id}</span>
                <span className="hf-dot-sep" />
                <span>{asset.meter}</span>
                <span className="hf-dot-sep" />
                <span>last service {asset.last}</span>
              </div>
            </div>
          </div>
          <div className="hf-divider" />
        </>
      )}

      <div className="hf-service-block">
        <div className="hf-label">Service due</div>
        <div className="hf-service-name">{asset.service}</div>
      </div>

      <div className="hf-meta-grid">
        <div className="hf-meta-item">
          <Icon name="repeat" size={14} color="var(--hf-ink-faint)" />
          <div className="hf-meta-text">
            <div className="hf-label-sm">Recurs</div>
            <div className="hf-meta-val">{asset.recurs}</div>
          </div>
        </div>
        <div className="hf-meta-item">
          <Icon name="clock-sm" size={14} color="var(--hf-ink-faint)" />
          <div className="hf-meta-text">
            <div className="hf-label-sm">Est. time</div>
            <div className="hf-meta-val">{asset.est}</div>
          </div>
        </div>
        <div className="hf-meta-item">
          <Icon name="pin" size={14} color="var(--hf-ink-faint)" />
          <div className="hf-meta-text">
            <div className="hf-label-sm">Where</div>
            <div className="hf-meta-val">{asset.where}</div>
          </div>
        </div>
        <div className="hf-meta-item">
          <Icon name="wrench" size={14} color="var(--hf-ink-faint)" />
          <div className="hf-meta-text">
            <div className="hf-label-sm">Assigned</div>
            <div className="hf-meta-val">{asset.assignee}</div>
          </div>
        </div>
      </div>

      <div className="hf-notes">
        <div className="hf-label">Notes</div>
        <p className="hf-notes-text">{asset.notes}</p>
      </div>

      <div className="hf-actions">
        <button className="hf-btn hf-btn-primary">
          <Icon name="check" size={14} stroke={2.2} />
          Mark complete
        </button>
        <button className="hf-btn hf-btn-secondary">
          <Icon name="calendar" size={14} />
          Reschedule
        </button>
        <button className="hf-btn hf-btn-ghost">
          <Icon name="snooze" size={14} />
          Snooze
        </button>
        {!compact && (
          <button className="hf-btn hf-btn-ghost hf-btn-end">
            View asset
            <Icon name="chevron-right" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ greeting + stat row ============ */
function HFGreeting() {
  const counts = HF_ASSETS.reduce(
    (acc, a) => {
      acc[a.status]++;
      return acc;
    },
    { overdue: 0, soon: 0, ok: 0 } as Record<AssetStatus, number>,
  );
  return (
    <div className="hf-greeting">
      <div className="hf-greeting-text">
        <h1 className="hf-h1">
          Hey Jess <span className="hf-wave">·</span>
        </h1>
        <div className="hf-greeting-sub">Tuesday · May 19, 2026 · 6 assets in your fleet</div>
      </div>
      <div className="hf-stats">
        <div className="hf-stat hf-stat-bad">
          <div className="hf-stat-val">{counts.overdue}</div>
          <div className="hf-stat-lbl">Overdue</div>
        </div>
        <div className="hf-stat hf-stat-warn">
          <div className="hf-stat-val">{counts.soon}</div>
          <div className="hf-stat-lbl">Due soon</div>
        </div>
        <div className="hf-stat hf-stat-ok">
          <div className="hf-stat-val">{counts.ok}</div>
          <div className="hf-stat-lbl">On track</div>
        </div>
      </div>
    </div>
  );
}

/* ============ main: master/detail ============ */
export function AppHome({ mobileMode = "inline" }: { mobileMode?: "inline" }) {
  const sorted = [...HF_ASSETS].sort((a, b) => a.dueDays - b.dueDays);
  const [selId, setSelId] = useState(sorted[0]?.id ?? "");
  const selected = HF_ASSETS.find((a) => a.id === selId) ?? sorted[0];
  const isNextUp = selId === sorted[0]?.id;

  useEffect(() => {
    document.title = "FieldOps — Home";
  }, []);

  if (!selected) return null;

  return (
    <div className={`hf hf-app hf-mobile-${mobileMode}`}>
      <HFTopBar />
      <main className="hf-main hf-shell">
        <HFGreeting />

        <div className="hf-filters">
          <div className="hf-filter-chips">
            <button className="hf-chip active">
              All <span className="hf-chip-count">6</span>
            </button>
            <button className="hf-chip">
              Vehicles <span className="hf-chip-count">2</span>
            </button>
            <button className="hf-chip">
              Equipment <span className="hf-chip-count">2</span>
            </button>
            <button className="hf-chip">
              Properties <span className="hf-chip-count">1</span>
            </button>
            <button className="hf-chip">
              Grounds <span className="hf-chip-count">1</span>
            </button>
          </div>
          <button className="hf-btn hf-btn-secondary hf-btn-sm">
            <Icon name="plus" size={14} stroke={2} />
            Add service
          </button>
        </div>

        <div className="hf-grid">
          {/* detail card */}
          <section className="hf-detail-card" data-status={selected.status}>
            <HFDetailBody asset={selected} isNextUp={isNextUp} />
          </section>

          {/* queue */}
          <section className="hf-queue">
            <div className="hf-queue-head">
              <h3 className="hf-h3">Queue</h3>
              <span className="hf-mono hf-ink-faint">By urgency · {HF_ASSETS.length}</span>
            </div>
            <ul className="hf-queue-list">
              {sorted.map((a) => {
                const isSel = a.id === selId;
                return (
                  <li
                    key={a.id}
                    className={`hf-row ${isSel ? "selected" : ""}`}
                    data-status={a.status}
                    onClick={() => setSelId(a.id)}
                  >
                    <div className="hf-row-summary">
                      <HFAssetIcon asset={a} size={36} />
                      <div className="hf-row-text">
                        <div className="hf-row-name">{a.name}</div>
                        <div className="hf-row-sub">{a.service}</div>
                      </div>
                      <div className="hf-row-right">
                        <div className="hf-row-due">{a.due}</div>
                        <span className="hf-status-dot" data-status={a.status} />
                      </div>
                    </div>
                    {isSel && (
                      <div className="hf-row-detail">
                        <HFDetailBody asset={a} compact isNextUp={isNextUp} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
      <HFBottomNav />
    </div>
  );
}
