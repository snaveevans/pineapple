import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import { cloudflareWebAnalyticsPlugin } from "./vite/cloudflareWebAnalyticsPlugin.ts";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

// Vite + React, bundled and served by a Cloudflare Worker via
// @cloudflare/vite-plugin. The Worker (worker/index.ts) handles any /api/*
// routes; everything else falls back to the SPA (see wrangler.jsonc).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, webRoot, "PINEAPPLE_");

  return {
    plugins: [react(), cloudflare(), cloudflareWebAnalyticsPlugin()],
    server: {
      proxy: {
        "/api": env.PINEAPPLE_API_PROXY_TARGET ?? "http://localhost:8787",
      },
    },
  };
});
