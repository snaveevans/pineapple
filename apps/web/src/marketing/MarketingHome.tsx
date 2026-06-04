import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";
import { HFAssetIcon, HFAssetThumb, HFStatusPill } from "../design/hf";
import { paths } from "../routes";

// Stylesheets: the .hf design tokens + asset components first, then the
// marketing-specific layer (which mirrors the tokens onto .mk so the reused
// .hf-* pieces resolve outside the app shell).
import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "./styles/marketing.css";

// Auth entry points. "Get started" deep-links to the sign-up screen, "Log in"
// to the login screen; the auth page reads ?mode= to pick its initial state.
const SIGNUP_HREF = paths.login("signup");
const LOGIN_HREF = paths.login("login");
const APP_HREF = paths.appHome;

// Defaults to false (unauthenticated) so buttons render immediately on load.
// Any failure from the session endpoint is also treated as unauthenticated.
function useSession(): boolean {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    fetch("/api/auth/get-session", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { session?: unknown } | null;
        if (data?.session) setAuthed(true);
      })
      .catch(() => undefined);
  }, []);

  return authed;
}

/* ============ nav ============ */
function MKNav({ authed }: { authed: boolean }) {
  return (
    <header className="mk-nav">
      <div className="mk-wrap mk-nav-in">
        <Link className="mk-logo" to={paths.home}>
          <span className="mk-logo-mark">
            <Brandmark size={17} color="white" />
          </span>
          <span className="mk-logo-text">FieldOps</span>
        </Link>
        <nav className="mk-nav-links">
          <a className="mk-nav-link" href="#how">
            How it works
          </a>
        </nav>
        <div className="mk-nav-cta">
          {authed ? (
            <Link className="mk-btn mk-btn-primary mk-btn-sm" to={APP_HREF}>
              Go to App
            </Link>
          ) : (
            <>
              <Link className="mk-link-quiet" to={LOGIN_HREF}>
                Log in
              </Link>
              <Link className="mk-btn mk-btn-primary mk-btn-sm" to={SIGNUP_HREF}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ============ hero collage — composed from real app pieces ============ */
function MKHeroCollage() {
  return (
    <div className="mk-collage">
      <div className="mk-collage-panel" />

      {/* floating "due soon" pill */}
      <div
        className="mk-float mk-float-pill hf-pill hf-pill-warn"
        style={{ boxShadow: "var(--hf-shadow-3)" }}
      >
        <Icon name="clock-sm" size={13} stroke={2} />
        In 2 days
      </div>

      {/* floating asset card (top-left) */}
      <div className="mk-float mk-float-card">
        <div
          className="hf hf-app"
          style={{
            display: "block",
            height: "auto",
            overflow: "visible",
            background: "transparent",
          }}
        >
          <article className="hf-asset-card" style={{ boxShadow: "none", border: 0 }}>
            <HFAssetThumb asset={{ cat: "lawn", icon: "leaf", status: "soon" }} height={120} />
            <div className="hf-asset-body">
              <h3 className="hf-asset-card-name">Riverside Lawn</h3>
              <div className="hf-asset-card-meta">
                <span className="hf-mono">LAWN-A</span>
              </div>
            </div>
            <div className="hf-asset-footer">
              <div className="hf-asset-footer-text">
                <div className="hf-label-sm">Next</div>
                <div className="hf-asset-next">Spring fertilizer</div>
              </div>
              <HFStatusPill status="ok" due="9 days" />
            </div>
          </article>
        </div>
      </div>

      {/* floating "next up" detail card (bottom-right) */}
      <div className="mk-float mk-float-next">
        <div
          className="hf"
          style={{
            display: "block",
            height: "auto",
            overflow: "visible",
            background: "transparent",
          }}
        >
          <span className="mk-next-eyebrow">
            <Icon name="arrow-right" size={11} stroke={2.2} />
            Next up
          </span>
          <div className="mk-next-head">
            <HFAssetIcon asset={{ category: "vehicle", icon: "truck" }} size={42} />
            <div>
              <div className="mk-next-name">Ford F-150 · #4</div>
              <div className="mk-next-sub">48,210 mi</div>
            </div>
          </div>
          <div className="mk-next-svc-lbl">Service due</div>
          <div className="mk-next-svc">Oil change + tire rotation</div>
          <div className="mk-next-row">
            <HFStatusPill status="overdue" due="3 days late" />
            <button className="hf-btn hf-btn-primary hf-btn-sm">
              <Icon name="check" size={13} stroke={2.2} />
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MKHero({ authed }: { authed: boolean }) {
  return (
    <section className="mk-hero">
      <div className="mk-wrap mk-hero-in">
        <div>
          <span className="mk-eyebrow">
            <Icon name="truck" size={13} stroke={2} />
            Built for owner-operators
          </span>
          <h1 className="mk-h1">
            Never miss a <em>service date</em> again.
          </h1>
          <p className="mk-lede">
            FieldOps keeps every truck, property, and tool you own on a maintenance schedule — so
            you spend less time remembering and more time working.
          </p>
          <div className="mk-hero-cta">
            {authed ? (
              <Link className="mk-btn mk-btn-primary mk-btn-lg" to={APP_HREF}>
                <Icon name="arrow-right" size={16} stroke={2.2} />
                Go to App
              </Link>
            ) : (
              <Link className="mk-btn mk-btn-primary mk-btn-lg" to={SIGNUP_HREF}>
                <Icon name="arrow-right" size={16} stroke={2.2} />
                Get started
              </Link>
            )}
            <a className="mk-btn mk-btn-ghost mk-btn-lg" href="#how">
              See how it works
            </a>
          </div>
          <div className="mk-hero-note">
            <Icon name="check" size={14} color="var(--hf-brand)" stroke={2.4} />
            Free to start · No card needed · Add your first asset in 2 minutes
          </div>
        </div>
        <MKHeroCollage />
      </div>
    </section>
  );
}

/* ============ small proof strip ============ */
function MKStrip() {
  return (
    <div className="mk-strip">
      <div className="mk-wrap mk-strip-in">
        <span className="mk-strip-text">
          Tracking <span className="mk-strip-stat">vehicles</span>,{" "}
          <span className="mk-strip-stat">properties</span>,{" "}
          <span className="mk-strip-stat">equipment</span> &amp;{" "}
          <span className="mk-strip-stat">grounds</span> — all in one place, from the truck or the
          office.
        </span>
      </div>
    </div>
  );
}

/* ============ how it works ============ */
const MK_STEPS = [
  {
    n: 1,
    title: "Add an asset",
    body: "Vehicle, property, or anything else you maintain. Pick a type and FieldOps asks the right details.",
  },
  {
    n: 2,
    title: "Set a schedule",
    body: "Choose how often it needs service — by time or by miles/hours. We track the cadence for you.",
  },
  {
    n: 3,
    title: "Get reminded",
    body: "A heads-up lands before each service is due. Mark it done, and the next one's queued automatically.",
  },
];

function MKSteps() {
  return (
    <section className="mk-section mk-steps-section" id="how">
      <div className="mk-wrap">
        <div className="mk-section-head">
          <div className="mk-kicker">How it works</div>
          <h2 className="mk-h2">Up and running in three steps</h2>
          <p>
            No setup project, no spreadsheets to import. Add your first asset and you're tracking it
            the same day.
          </p>
        </div>
        <div className="mk-steps">
          {MK_STEPS.map((s) => (
            <div className="mk-step" key={s.n}>
              <div className="mk-step-connector" />
              <div className="mk-step-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ closing CTA ============ */
function MKCta({ authed }: { authed: boolean }) {
  return (
    <section className="mk-cta-band">
      <div className="mk-wrap">
        <div className="mk-cta-box">
          <h2>Start keeping everything on schedule.</h2>
          <p>Add your first asset in two minutes. Free to start — no card, no commitment.</p>
          <div className="mk-hero-cta">
            {authed ? (
              <Link className="mk-btn mk-btn-primary mk-btn-lg" to={APP_HREF}>
                <Icon name="arrow-right" size={16} stroke={2.2} />
                Go to App
              </Link>
            ) : (
              <>
                <Link className="mk-btn mk-btn-primary mk-btn-lg" to={SIGNUP_HREF}>
                  <Icon name="arrow-right" size={16} stroke={2.2} />
                  Get started
                </Link>
                <Link className="mk-btn mk-btn-ghost mk-btn-lg" to={LOGIN_HREF}>
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MKFooter({ authed }: { authed: boolean }) {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap mk-footer-in">
        <Link className="mk-logo" to={paths.home}>
          <span className="mk-logo-mark">
            <Icon name="wrench" size={16} color="white" stroke={2} />
          </span>
          <span className="mk-logo-text">FieldOps</span>
        </Link>
        <nav className="mk-footer-links">
          <a href="#how">How it works</a>
          {!authed && <Link to={LOGIN_HREF}>Log in</Link>}
        </nav>
        <div className="mk-footer-copy">© 2026 FieldOps</div>
      </div>
    </footer>
  );
}

export function MarketingHome() {
  const authed = useSession();

  useEffect(() => {
    document.title = "FieldOps — Keep everything you own on schedule";
  }, []);

  return (
    <div className="mk">
      <MKNav authed={authed} />
      <MKHero authed={authed} />
      <MKStrip />
      <MKSteps />
      <MKCta authed={authed} />
      <MKFooter authed={authed} />
    </div>
  );
}
