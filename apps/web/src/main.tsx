import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MarketingHome } from "./marketing/MarketingHome";
import { AuthFlow } from "./auth/AuthFlow";
import { AppHome } from "./app/AppHome";

// Minimal path-based routing. The Worker serves index.html for any unmatched
// path (wrangler.jsonc -> assets.not_found_handling: "single-page-application"),
// so /login and /app resolve here; everything else renders the marketing home.
// /login reads ?mode=login|signup to pick its initial screen (set by the
// marketing CTAs); /app is the authenticated master/detail home.
function App() {
  const path = window.location.pathname;
  if (path === "/login") return <AuthFlow />;
  if (path === "/app") return <AppHome />;
  return <MarketingHome />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
