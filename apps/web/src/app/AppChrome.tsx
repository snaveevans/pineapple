import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router";
import { getUserProfile, userProfileQueryKey } from "../api/userProfile";
import { Icon, type IconName } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";
import { paths } from "../routes";
import { profileAvatarInitial } from "./profilePresentation";
import { AppSearch } from "./AppSearch";

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
  const location = useLocation();
  const profileActive = location.pathname === paths.profile;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const { data: profile } = useQuery({
    queryKey: userProfileQueryKey,
    queryFn: getUserProfile,
  });

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.setTimeout(() => searchButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  return (
    <>
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
          <button
            ref={searchButtonRef}
            type="button"
            className="hf-icon-btn"
            title="Search"
            aria-label="Search assets"
            onClick={openSearch}
          >
            <Icon name="search" size={16} />
          </button>
          <button type="button" className="hf-icon-btn hf-icon-btn-badge" title="Notifications">
            <Icon name="bell" size={16} />
            <span className="hf-badge">3</span>
          </button>
          <NavLink
            to={paths.profile}
            className={`hf-avatar${profileActive ? " hf-avatar-ring" : ""}`}
            title={profile?.name ?? "Profile settings"}
          >
            {profileAvatarInitial(profile?.name)}
          </NavLink>
        </div>
      </header>
      <AppSearch open={searchOpen} onClose={closeSearch} />
    </>
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
