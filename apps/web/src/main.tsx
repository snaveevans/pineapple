import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MarketingHome } from "./marketing/MarketingHome";
import { AuthFlow } from "./auth/AuthFlow";

// Minimal path-based routing. The Worker serves index.html for any unmatched
// path (wrangler.jsonc -> assets.not_found_handling: "single-page-application"),
// so /login resolves here; everything else renders the marketing home.
// /login reads ?mode=login|signup to pick its initial screen (set by the
// marketing CTAs).
function App() {
  return window.location.pathname === "/login" ? <AuthFlow /> : <MarketingHome />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
