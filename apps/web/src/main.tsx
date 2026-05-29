import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MarketingHome } from "./marketing/MarketingHome";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <MarketingHome />
  </StrictMode>,
);
