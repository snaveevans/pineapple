import type { Browser, BrowserContext, Page } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { EMPTY_NOTIFS, FIXED_NOW, PROFILE } from "./fixtures.ts";
import {
  VIEWPORTS,
  type ApiStub,
  type RenderedState,
  type ViewportName,
  renderedStates,
} from "./registry.ts";

export type ShotResult = {
  id: string;
  viewport: ViewportName;
  file: string;
  bytes: number;
  md5: string;
};

function fulfillJson(stub: Extract<ApiStub, { kind: "json" }>) {
  return {
    status: stub.status ?? 200,
    contentType: "application/json",
    body: JSON.stringify(stub.body),
  };
}

async function installApiRoutes(
  page: Page,
  stubs: RenderedState["stubs"],
  pendingGates: Array<() => void>,
): Promise<void> {
  const hold = (label: string): Promise<void> =>
    new Promise<void>((resolve) => {
      pendingGates.push(() => resolve());
      // Never auto-resolve — loading states stay pending for the shot.
      void label;
    });

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (
      url.hostname.includes("fonts.googleapis.com") ||
      url.hostname.includes("fonts.gstatic.com") ||
      url.hostname.includes("cloudflareinsights.com")
    ) {
      await route.abort();
      return;
    }

    if (!path.startsWith("/api/")) {
      await route.continue();
      return;
    }

    const resolveStub = async (stub: ApiStub | undefined, fallback: ApiStub): Promise<void> => {
      const active = stub ?? fallback;
      if (active.kind === "pending") {
        await hold(path);
        // If released, fulfill with empty-ish success so teardown is clean.
        await route.fulfill(fulfillJson({ kind: "json", body: {} }));
        return;
      }
      if (active.kind === "handler") {
        const next = active.handle(url, method);
        if (next === null) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: `no handler for ${path}` }),
          });
          return;
        }
        await resolveStub(next, fallback);
        return;
      }
      await route.fulfill(fulfillJson(active));
    };

    if (method === "GET" && path === "/api/users/me") {
      await resolveStub(undefined, { kind: "json", body: PROFILE });
      return;
    }

    if (method === "GET" && path === "/api/notifications") {
      // Chrome uses limit=1; page uses limit=20. Same stub body works for both
      // unless the state specifically overrides notifications.
      const fallback: ApiStub = stubs.notifications ?? { kind: "json", body: EMPTY_NOTIFS };
      // When the page is the notifications screen and stubs.notifications is set,
      // chrome limit=1 also receives that payload — acceptable for gallery.
      await resolveStub(stubs.notifications, fallback);
      return;
    }

    if (method === "GET" && path === "/api/assets") {
      await resolveStub(stubs.assets, { kind: "json", body: { assets: [], counts: {} } });
      return;
    }

    if (method === "GET" && path === "/api/activity") {
      await resolveStub(stubs.activity, {
        kind: "json",
        body: {
          viewerUserId: "",
          entries: [],
          availableFilters: { types: [], assets: [] },
          nextCursor: null,
        },
      });
      return;
    }

    if (method === "GET" && path === "/api/teams/me") {
      await resolveStub(stubs.teamsMe, { kind: "json", body: { team: null, viewerUserId: "" } });
      return;
    }

    // Default: benign empty JSON so stray calls don't hang the page.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

/**
 * Product CSS locks the app shell to the viewport (`.hf { height:100%; overflow:hidden }`)
 * with internal scrollers. Playwright `fullPage` only expands with document scroll height,
 * so long screens (Activity History) would otherwise clip to the viewport and hide
 * below-fold states like "Load older". Unlock is harness-only — no product edit.
 */
async function unlockDocumentScroll(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .hf, .hf-app, .hf-main, .hf-shell, .hh, .nt-main, .hf-aa-page, .hf-aa-body {
        height: auto !important;
        max-height: none !important;
        min-height: 100vh !important;
        overflow: visible !important;
        flex: none !important;
      }
      /* Belt-and-braces with screenshot animations:"disabled" after unlock reflow. */
      *, *::before, *::after {
        animation: none !important;
        animation-duration: 0s !important;
        transition: none !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ready = document.fonts?.ready;
    if (ready !== undefined) await ready;
  });
  const fontsOk = await page.evaluate(() => document.fonts.check("600 16px Inter"));
  if (!fontsOk) {
    throw new Error('document.fonts.check("600 16px Inter") returned false');
  }
  // Two frames after unlock, then a layout-stable read of scrollHeight.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            void document.documentElement.scrollHeight;
            r();
          }),
        ),
      ),
  );
}

export type RenderOptions = {
  outDir: string;
  baseURL: string;
  browser: Browser;
  states?: RenderedState[];
  viewports?: ViewportName[];
};

export async function renderGallery(opts: RenderOptions): Promise<{
  results: ShotResult[];
  elapsedMs: number;
}> {
  const states = opts.states ?? renderedStates();
  const viewports = opts.viewports ?? (["desktop", "mobile"] as ViewportName[]);
  mkdirSync(opts.outDir, { recursive: true });

  const results: ShotResult[] = [];
  const t0 = performance.now();

  for (const state of states) {
    for (const vpName of viewports) {
      const vp = VIEWPORTS[vpName];
      const pendingGates: Array<() => void> = [];
      const context: BrowserContext = await opts.browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await context.clock.install({ time: new Date(FIXED_NOW) });

      const page = await context.newPage();
      try {
        if (state.localStorage) {
          const entries = state.localStorage;
          await page.addInitScript((pairs) => {
            for (const [k, v] of Object.entries(pairs)) {
              try {
                localStorage.setItem(k, v);
              } catch {
                /* ignore quota */
              }
            }
          }, entries);
        }

        await installApiRoutes(page, state.stubs, pendingGates);
        await page.goto(`${opts.baseURL}${state.route}`, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await state.ready(page);
        if (state.interact) await state.interact(page);
        await unlockDocumentScroll(page);
        await settle(page);

        const fileName = `${state.id.replaceAll("/", "__")}__${vpName}.png`;
        const file = join(opts.outDir, fileName);
        await page.screenshot({
          path: file,
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          scale: "css",
          type: "png",
        });

        const buf = readFileSync(file);
        results.push({
          id: state.id,
          viewport: vpName,
          file,
          bytes: buf.length,
          md5: createHash("md5").update(buf).digest("hex"),
        });
      } finally {
        for (const release of pendingGates) release();
        await context.close();
      }
    }
  }

  return { results, elapsedMs: performance.now() - t0 };
}

export function writeManifest(outDir: string, results: ShotResult[], elapsedMs: number): void {
  const manifest = {
    generatedAt: new Date().toISOString(),
    elapsedMs,
    count: results.length,
    totalBytes: results.reduce((n, r) => n + r.bytes, 0),
    results: results.map((r) => ({
      id: r.id,
      viewport: r.viewport,
      file: r.file.split("/").pop(),
      bytes: r.bytes,
      md5: r.md5,
    })),
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function buildHtmlIndex(outDir: string, results: ShotResult[]): void {
  const groups = new Map<string, ShotResult[]>();
  for (const r of results) {
    const list = groups.get(r.id) ?? [];
    list.push(r);
    groups.set(r.id, list);
  }

  const sections: string[] = [];
  for (const [id, shots] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const cells = shots
      .sort((a, b) => a.viewport.localeCompare(b.viewport))
      .map((s) => {
        const b64 = readFileSync(s.file).toString("base64");
        return `<figure class="cell"><figcaption>${s.viewport} · ${s.bytes.toLocaleString()} B</figcaption><img alt="${id} ${s.viewport}" src="data:image/png;base64,${b64}" /></figure>`;
      })
      .join("\n");
    sections.push(`<section><h2>${id}</h2><div class="row">${cells}</div></section>`);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Pineapple web state gallery</title>
<style>
  :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; padding: 24px; background: #f4f2ee; color: #1a1a1a; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  .meta { color: #555; margin-bottom: 24px; font-size: 0.9rem; }
  section { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 0.95rem; margin: 0 0 12px; font-family: ui-monospace, monospace; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; }
  .cell { margin: 0; flex: 1 1 280px; max-width: 640px; }
  figcaption { font-size: 0.8rem; color: #666; margin-bottom: 6px; }
  img { width: 100%; height: auto; border: 1px solid #eee; border-radius: 8px; background: #fafafa; }
</style>
</head>
<body>
<h1>Pineapple web state gallery</h1>
<p class="meta">${results.length} shots · ${results.reduce((n, r) => n + r.bytes, 0).toLocaleString()} bytes total · self-contained (no external requests)</p>
${sections.join("\n")}
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), html);
}

export function chromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base) {
    // Cloud agent layout
    const candidates = [
      join(base, "chromium-1208/chrome-linux/chrome"),
      join(base, "chromium-1208/chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  const home = process.env.HOME ?? "";
  const mac = join(
    home,
    "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
  if (existsSync(mac)) return mac;
  const macX64 = join(
    home,
    "Library/Caches/ms-playwright/chromium-1208/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
  if (existsSync(macX64)) return macX64;
  return undefined;
}

export const CHROMIUM_ARGS = ["--font-render-hinting=none", "--disable-lcd-text"];
