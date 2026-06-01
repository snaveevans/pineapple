import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";
import { HFAssetIcon, HFAssetThumb } from "../design/hf";
import { paths } from "../routes";

// Stylesheets: the .hf design tokens + asset components first, then the
// auth-specific layer (which mirrors the tokens onto .au so the reused .hf-*
// collage pieces resolve outside the app shell).
import "../design/styles/hifi.css";
import "../design/styles/hifi-assets.css";
import "./styles/auth.css";

type Mode = "login" | "signup";
type Phase = "form" | "redirect";

type SessionUser = { email: string; name?: string | null } | null;

/** Kick off Better Auth's Google OAuth. Resolves the consent URL then navigates. */
async function startGoogleSignIn() {
  const res = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      provider: "google",
      // Return to /login so the page can confirm the session was established.
      callbackURL: `${window.location.origin}/login`,
      errorCallbackURL: `${window.location.origin}/login?error=google`,
    }),
  });
  if (!res.ok) throw new Error(`sign-in/social failed: ${res.status}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("sign-in/social returned no redirect url");
  window.location.href = data.url;
}

/** official Google "G" mark for the sign-in button */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/* ============ brand panel (left) — product preview + value props ============ */
const AU_VALUES = [
  "Every truck, property, and tool on one schedule",
  "Automatic reminders before each service is due",
  "See what's overdue the moment you log in",
];

function AuthCollage() {
  return (
    <div className="au-collage">
      <div className="au-float au-float-pill hf-pill hf-pill-warn">
        <Icon name="clock-sm" size={13} stroke={2} />
        In 2 days
      </div>

      <div className="au-float au-float-card">
        <article className="hf-asset-card" style={{ boxShadow: "none", border: 0 }}>
          <HFAssetThumb asset={{ cat: "lawn", icon: "leaf", status: "ok" }} height={104} />
          <div className="hf-asset-body">
            <h3 className="hf-asset-card-name">Riverside Lawn</h3>
            <div className="hf-asset-card-meta">
              <span className="hf-mono">LAWN-A</span>
            </div>
          </div>
        </article>
      </div>

      <div className="au-float au-float-next">
        <span className="au-next-eyebrow">
          <Icon name="arrow-right" size={10} stroke={2.2} />
          Next up
        </span>
        <div className="au-next-head">
          <HFAssetIcon asset={{ category: "vehicle", icon: "truck" }} size={38} />
          <div>
            <div className="au-next-name">Ford F-150 · #4</div>
            <div className="au-next-sub">48,210 mi</div>
          </div>
        </div>
        <div className="au-next-svc-lbl">Service due</div>
        <div className="au-next-svc">Oil change + tire rotation</div>
      </div>
    </div>
  );
}

function AuthBrand() {
  return (
    <div className="au-brand">
      <Link className="au-brand-logo" to={paths.home}>
        <span className="au-brand-mark">
          <Brandmark size={17} color="white" />
        </span>
        <span className="au-brand-name">FieldOps</span>
      </Link>
      <div className="au-brand-content">
        <div className="au-brand-body">
          <h2 className="au-brand-h2">Keep everything you own on schedule.</h2>
          <ul className="au-brand-list">
            {AU_VALUES.map((v) => (
              <li key={v}>
                <span className="au-check">
                  <Icon name="check" size={12} stroke={3} />
                </span>
                {v}
              </li>
            ))}
          </ul>
        </div>
        <AuthCollage />
      </div>
    </div>
  );
}

/* ============ auth card (login / signup share Google entry) ============ */
function AuthCard({
  mode,
  onGoogle,
  onSwitch,
}: {
  mode: Mode;
  onGoogle: () => void;
  onSwitch: (mode: Mode) => void;
}) {
  const isSignup = mode === "signup";
  return (
    <div className="au-card">
      <Link className="au-card-logo" to={paths.home}>
        <span className="au-brand-mark">
          <Icon name="wrench" size={16} color="white" stroke={2} />
        </span>
        <span className="au-brand-name">FieldOps</span>
      </Link>

      <div className="au-eyebrow">{isSignup ? "Get started" : "Welcome back"}</div>
      <h1 className="au-h1">{isSignup ? "Create your account" : "Log in to FieldOps"}</h1>
      <p className="au-sub">
        {isSignup
          ? "Start tracking your assets in minutes. No credit card required."
          : "Pick up right where you left off."}
      </p>

      <button className="au-google" onClick={onGoogle}>
        <GoogleG size={19} />
        Continue with Google
      </button>

      <div className="au-divider">
        <span>Phase 1</span>
      </div>

      <div className="au-soon">
        <span className="au-soon-icon">
          <Icon name="info" size={16} />
        </span>
        Email &amp; password sign-in is coming soon. For now, continue with your Google account.
      </div>

      <p className="au-legal">
        By continuing you agree to FieldOps' <a href="#">Terms of Service</a> and{" "}
        <a href="#">Privacy Policy</a>.
      </p>

      <div className="au-switch">
        {isSignup ? (
          <>
            Already have an account? <button onClick={() => onSwitch("login")}>Log in</button>
          </>
        ) : (
          <>
            New to FieldOps? <button onClick={() => onSwitch("signup")}>Create an account</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============ redirecting-to-Google state ============ */
function AuthRedirect({ mode, onCancel }: { mode: Mode; onCancel: () => void }) {
  return (
    <div className="au-redirect">
      <div className="au-redirect-badge">
        <div className="au-spinner" />
        <GoogleG size={30} />
      </div>
      <h1>Connecting to Google…</h1>
      <p>
        {mode === "signup"
          ? "We'll set up your account once you're back."
          : "Hang tight — taking you to Google to sign in."}
      </p>
      <button className="au-redirect-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/* ============ signed-in confirmation (post-OAuth return) ============ */
function AuthSignedIn({
  user,
  onSignOut,
}: {
  user: { email: string; name?: string | null };
  onSignOut: () => void;
}) {
  return (
    <div className="au-redirect">
      <div className="au-redirect-badge">
        <Icon name="check" size={30} color="var(--hf-brand)" stroke={2.4} />
      </div>
      <h1>You're signed in</h1>
      <p>
        Signed in as <strong>{user.name ?? user.email}</strong>
        {user.name ? ` (${user.email})` : ""}.
      </p>
      <div className="au-hero-cta" style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Link className="au-google" style={{ width: "auto", padding: "0 20px" }} to={paths.appHome}>
          Go to FieldOps
        </Link>
      </div>
      <button className="au-redirect-cancel" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

/* ============ page ============ */
export function AuthFlow() {
  // mode: "login" | "signup" ; phase: "form" | "redirect"
  // initial mode comes from ?mode= so marketing CTAs can deep-link the right screen
  const [searchParams] = useSearchParams();
  const initialMode: Mode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [phase, setPhase] = useState<Phase>("form");
  // undefined = still checking; null = logged out; object = logged in
  const [session, setSession] = useState<SessionUser | undefined>(undefined);

  useEffect(() => {
    document.title = "FieldOps — Sign in";
  }, []);

  // On load (and after returning from Google) check whether a session exists.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/get-session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: SessionUser } | null) => {
        if (!cancelled) setSession(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onGoogle = () => {
    setPhase("redirect");
    startGoogleSignIn().catch((err) => {
      console.error(err);
      setPhase("form");
    });
  };

  const onSignOut = () => {
    // Better Auth's /sign-out requires a JSON content-type AND a (non-empty)
    // JSON body — without the header it 415s, with the header but an empty body
    // it 500s on JSON.parse. Send "{}". The response clears the session cookies.
    fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "include",
    }).finally(() => {
      // Logged out → full-page reload to the marketing home so any in-memory
      // session state is wiped, not just unmounted.
      window.location.href = paths.home;
    });
  };

  return (
    <div className="au">
      <div className="au-split">
        <AuthBrand />
        <div className="au-form-side">
          {session ? (
            <AuthSignedIn user={session} onSignOut={onSignOut} />
          ) : phase === "redirect" ? (
            <AuthRedirect mode={mode} onCancel={() => setPhase("form")} />
          ) : (
            <AuthCard mode={mode} onGoogle={onGoogle} onSwitch={(m) => setMode(m)} />
          )}
        </div>
      </div>
    </div>
  );
}
