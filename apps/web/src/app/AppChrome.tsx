import { NavLink } from "react-router";
import { Icon, type IconName } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";
import { paths } from "../routes";

// Shared authenticated-app chrome: the desktop top bar and the mobile bottom
// tab bar. Ported from the FieldOps prototype (hifi.jsx). Both the Home
// (master/detail) and Assets pages render this, so nav lives here. Tabs that
// have a real page carry a route; placeholders (Schedule, History) don't.

export type AppNav = "home" | "assets" | "schedule" | "history";

interface NavItem {
  id: AppNav;
  label: string;
  icon: IconName;
  to?: string;
  end?: boolean;
}

const HF_NAV: NavItem[] = [
  { id: "home", label: "Home", icon: "home-nav", to: paths.appHome, end: true },
  { id: "assets", label: "Assets", icon: "grid", to: paths.assets },
  { id: "schedule", label: "Schedule", icon: "calendar" },
  { id: "history", label: "History", icon: "clock" },
];

export function HFTopBar() {
  return (
    <header className="hf-topbar">
      <div className="hf-topbar-left">
        <div className="hf-logo">
          <div className="hf-logo-mark">
            <Brandmark size={15} color="white" />
          </div>
          <span className="hf-logo-text">FieldOps</span>
        </div>
        <nav className="hf-nav-top">
          {HF_NAV.map((n) =>
            n.to ? (
              <NavLink
                key={n.id}
                to={n.to}
                end={n.end ?? false}
                className={({ isActive }) => `hf-nav-tab ${isActive ? "active" : ""}`}
                title={n.label}
              >
                <Icon name={n.icon} size={16} />
                <span className="hf-nav-label">{n.label}</span>
              </NavLink>
            ) : (
              <span key={n.id} className="hf-nav-tab" title={n.label} aria-disabled="true">
                <Icon name={n.icon} size={16} />
                <span className="hf-nav-label">{n.label}</span>
              </span>
            ),
          )}
        </nav>
      </div>
      <div className="hf-topbar-right">
        <button className="hf-icon-btn" title="Search">
          <Icon name="search" size={16} />
        </button>
        <button className="hf-icon-btn hf-icon-btn-badge" title="Notifications">
          <Icon name="bell" size={16} />
          <span className="hf-badge">3</span>
        </button>
        <div className="hf-avatar">J</div>
      </div>
    </header>
  );
}

export function HFBottomNav() {
  return (
    <nav className="hf-nav-bottom">
      {HF_NAV.map((n) =>
        n.to ? (
          <NavLink
            key={n.id}
            to={n.to}
            end={n.end ?? false}
            className={({ isActive }) => `hf-nav-bottom-tab ${isActive ? "active" : ""}`}
          >
            {({ isActive }) => (
              <>
                <Icon name={n.icon} size={20} stroke={isActive ? 2 : 1.5} />
                <span>{n.label}</span>
              </>
            )}
          </NavLink>
        ) : (
          <span key={n.id} className="hf-nav-bottom-tab" aria-disabled="true">
            <Icon name={n.icon} size={20} stroke={1.5} />
            <span>{n.label}</span>
          </span>
        ),
      )}
    </nav>
  );
}
