import { Icon, type IconName } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";

// Shared authenticated-app chrome: the desktop top bar and the mobile bottom
// tab bar. Ported from the FieldOps prototype (hifi.jsx). Both the Home
// (master/detail) and Assets pages render this, so nav lives here. Tabs that
// have a real page carry an href; placeholders (Schedule, History) don't.

export type AppNav = "home" | "assets" | "schedule" | "history";

interface NavItem {
  id: AppNav;
  label: string;
  icon: IconName;
  href?: string;
}

const HF_NAV: NavItem[] = [
  { id: "home", label: "Home", icon: "home-nav", href: "/app" },
  { id: "assets", label: "Assets", icon: "grid", href: "/app/assets" },
  { id: "schedule", label: "Schedule", icon: "calendar" },
  { id: "history", label: "History", icon: "clock" },
];

export function HFTopBar({ activeNav = "home" }: { activeNav?: AppNav }) {
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
          {HF_NAV.map((n) => (
            <a
              key={n.id}
              href={n.href}
              className={`hf-nav-tab ${n.id === activeNav ? "active" : ""}`}
              title={n.label}
            >
              <Icon name={n.icon} size={16} />
              <span className="hf-nav-label">{n.label}</span>
            </a>
          ))}
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

export function HFBottomNav({ activeNav = "home" }: { activeNav?: AppNav }) {
  return (
    <nav className="hf-nav-bottom">
      {HF_NAV.map((n) => (
        <a
          key={n.id}
          href={n.href}
          className={`hf-nav-bottom-tab ${n.id === activeNav ? "active" : ""}`}
        >
          <Icon name={n.icon} size={20} stroke={n.id === activeNav ? 2 : 1.5} />
          <span>{n.label}</span>
        </a>
      ))}
    </nav>
  );
}
