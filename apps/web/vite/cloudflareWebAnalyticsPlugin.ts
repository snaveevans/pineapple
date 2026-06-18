import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { parseWranglerJsonc } from "./parseWranglerJsonc.ts";

export { parseWranglerJsonc } from "./parseWranglerJsonc.ts";

export const WEB_ANALYTICS_MARKER = "<!-- cloudflare-web-analytics -->";
const PLACEHOLDER_TOKEN = "REPLACE_WITH_SITE_TOKEN";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const wranglerConfigPath = resolve(pluginDir, "../wrangler.jsonc");

function readWranglerVar(name: string): string | undefined {
  const config = parseWranglerJsonc(readFileSync(wranglerConfigPath, "utf8"));
  return config.vars?.[name]?.trim();
}

function webAnalyticsBeacon(token: string): string {
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;
}

export function resolveWebAnalyticsBeacon(token: string | undefined): string {
  if (!token || token === PLACEHOLDER_TOKEN) return "";
  return webAnalyticsBeacon(token);
}

export function transformWebAnalyticsHtml(html: string, token: string | undefined): string {
  if (!html.includes(WEB_ANALYTICS_MARKER)) {
    console.warn(
      `[cloudflare-web-analytics] ${WEB_ANALYTICS_MARKER} not found in index.html — beacon will not be injected`,
    );
    return html;
  }

  return html.replace(WEB_ANALYTICS_MARKER, resolveWebAnalyticsBeacon(token));
}

export function cloudflareWebAnalyticsPlugin(): Plugin {
  const token = readWranglerVar("CF_WEB_ANALYTICS_TOKEN");

  return {
    name: "cloudflare-web-analytics",
    transformIndexHtml(html) {
      return transformWebAnalyticsHtml(html, token);
    },
  };
}
