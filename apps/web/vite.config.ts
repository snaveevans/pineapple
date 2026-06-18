import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareWebAnalyticsPlugin } from "./vite/cloudflareWebAnalyticsPlugin.ts";

// Vite + React, bundled and served by a Cloudflare Worker via
// @cloudflare/vite-plugin. The Worker (worker/index.ts) handles any /api/*
// routes; everything else falls back to the SPA (see wrangler.jsonc).
export default defineConfig({
  plugins: [react(), cloudflare(), cloudflareWebAnalyticsPlugin()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
