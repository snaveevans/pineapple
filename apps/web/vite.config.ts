import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Vite + React, bundled and served by a Cloudflare Worker via
// @cloudflare/vite-plugin. The Worker (worker/index.ts) handles any /api/*
// routes; everything else falls back to the SPA (see wrangler.jsonc).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  if (mode === "production" && env["VITE_API_URL"]) {
    throw new Error(
      "VITE_API_URL must be empty for production builds. Production web and API requests are same-origin.",
    );
  }
  return { plugins: [react(), cloudflare()] };
});
