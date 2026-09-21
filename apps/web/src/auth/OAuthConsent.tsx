import { useEffect, useMemo, useState } from "react";
import { getUserProfile } from "../api/userProfile";
import { Brandmark } from "../design/Brandmark";
import { Icon } from "../design/Icon";
import { decideOAuthConsent, getOAuthClient } from "./authClient";
import "../design/styles/hifi.css";
import "./styles/oauth-consent.css";

type ConsentState =
  | { phase: "loading" }
  | { phase: "ready"; clientName: string }
  | { phase: "submitting"; clientName: string }
  | { phase: "error"; message: string };

type Permission = {
  scope: string;
  title: string;
  description: string;
};

const PERMISSIONS: Permission[] = [
  {
    scope: "assets:read",
    title: "View your active Pineapple assets",
    description: "Includes assets you own and assets shared with you through a team.",
  },
  {
    scope: "offline_access",
    title: "Stay connected until you disconnect",
    description: "ChatGPT can renew this connection without asking you to sign in each time.",
  },
];

function requestedPermissions(search: URLSearchParams): Permission[] {
  const scopes = new Set((search.get("scope") ?? "").split(/\s+/).filter(Boolean));
  return PERMISSIONS.filter(({ scope }) => scopes.has(scope));
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className="oc-shell">
      <section className="oc-card" aria-labelledby="oc-error-title">
        <div className="oc-error-icon">
          <Icon name="alert" size={26} stroke={2} />
        </div>
        <h1 id="oc-error-title">Connection unavailable</h1>
        <p>{message}</p>
        <p className="oc-help">Return to ChatGPT and start the connection again.</p>
      </section>
    </main>
  );
}

export function OAuthConsent() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = search.get("client_id");
  const hasSignedRequest = search.has("sig");
  const permissions = useMemo(() => requestedPermissions(search), [search]);
  const [state, setState] = useState<ConsentState>(
    clientId !== null && hasSignedRequest
      ? { phase: "loading" }
      : { phase: "error", message: "This connection request is invalid or expired." },
  );

  useEffect(() => {
    document.title = "Connect ChatGPT — Pineapple";
    if (clientId === null || !hasSignedRequest) return;

    let cancelled = false;
    Promise.all([getUserProfile(), getOAuthClient(clientId)])
      .then(([, client]) => {
        if (!cancelled) setState({ phase: "ready", clientName: client.name });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            phase: "error",
            message: "This connection request is invalid or expired.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, hasSignedRequest]);

  const submit = (accept: boolean) => {
    if (state.phase !== "ready") return;
    const clientName = state.clientName;
    setState({ phase: "submitting", clientName });
    decideOAuthConsent(accept).catch(() => {
      setState({
        phase: "error",
        message: "Pineapple could not complete this connection request.",
      });
    });
  };

  if (state.phase === "error") return <ConsentError message={state.message} />;

  if (state.phase === "loading") {
    return (
      <main className="oc-shell">
        <div className="oc-loading" role="status">
          <span className="oc-spinner" />
          Checking connection request…
        </div>
      </main>
    );
  }

  const isSubmitting = state.phase === "submitting";

  return (
    <main className="oc-shell">
      <section className="oc-card" aria-labelledby="oc-title">
        <div className="oc-brand" aria-label="Pineapple">
          <span className="oc-brandmark">
            <Brandmark size={20} color="white" />
          </span>
          <span>Pineapple</span>
        </div>

        <div className="oc-connector" aria-hidden="true">
          <span className="oc-app-badge">AI</span>
          <span className="oc-connector-line" />
          <span className="oc-pineapple-badge">
            <Brandmark size={22} color="white" />
          </span>
        </div>

        <h1 id="oc-title">{state.clientName} wants to connect</h1>
        <p className="oc-intro">Allow this connection to:</p>

        <ul className="oc-permissions">
          {permissions.map((permission) => (
            <li key={permission.scope}>
              <span className="oc-check">
                <Icon name="check" size={14} stroke={2.5} />
              </span>
              <span>
                <strong>{permission.title}</strong>
                <small>{permission.description}</small>
              </span>
            </li>
          ))}
        </ul>

        <div className="oc-private">
          <Icon name="lock" size={17} stroke={2} />
          <span>
            <strong>Property addresses are never shared.</strong> This connection cannot create,
            edit, archive, or delete anything.
          </span>
        </div>

        <div className="oc-actions">
          <button
            type="button"
            className="oc-allow"
            disabled={isSubmitting}
            onClick={() => submit(true)}
          >
            {isSubmitting ? "Connecting…" : "Allow access"}
          </button>
          <button
            type="button"
            className="oc-cancel"
            disabled={isSubmitting}
            onClick={() => submit(false)}
          >
            Cancel
          </button>
        </div>

        <p className="oc-footnote">You can disconnect this integration from ChatGPT at any time.</p>
      </section>
    </main>
  );
}
