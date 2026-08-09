/**
 * Render the web state gallery into a parameterised output directory.
 *
 *   pnpm --filter @snaveevans/pineapple-web gallery:render -- --out apps/web/gallery/out
 *
 * Output dir is parameterised so #146 can invoke base + head in one job.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { startGalleryServer } from "./server.ts";
import {
  CHROMIUM_ARGS,
  buildHtmlIndex,
  chromiumExecutablePath,
  renderGallery,
  writeManifest,
} from "./harness.ts";
import { checkCoverage } from "./check-coverage.ts";
import { assertRegistryInvariants, registryEntries, renderedStates } from "./registry.ts";
import { DEFAULT_FEATURE_SOURCES, parseFeatureFiles } from "./parse-features.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function resolveOutDir(raw: string | undefined): string {
  const fallback = join(HERE, "out");
  if (raw === undefined) return fallback;
  // Absolute paths win; relative paths are from the repo root so CI and local
  // invocations share the same --out contract regardless of package cwd.
  if (raw.startsWith("/")) return raw;
  return resolve(REPO_ROOT, raw);
}

async function main(): Promise<void> {
  const outDir = resolveOutDir(argValue("--out"));
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  // Coverage gate before spending browser time. Registry is hand-authored —
  // every FEATURES id must be rendered or excluded (#193).
  const features = parseFeatureFiles(DEFAULT_FEATURE_SOURCES.map((p) => join(REPO_ROOT, p)));
  const registry = registryEntries();
  assertRegistryInvariants(registry);
  const coverageErrors = checkCoverage(features, registry);
  if (coverageErrors.length > 0) {
    throw new Error(`gallery coverage check failed:\n${coverageErrors.join("\n")}`);
  }

  console.log(`registry: ${registry.length} ids, rendered: ${renderedStates().length}`);

  const { baseURL, close } = await startGalleryServer();
  console.log(`serving production build at ${baseURL}`);

  const executablePath = chromiumExecutablePath();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath !== undefined ? { executablePath } : {}),
    args: CHROMIUM_ARGS,
  });

  try {
    const { results, elapsedMs } = await renderGallery({ outDir, baseURL, browser });
    writeManifest(outDir, results, elapsedMs);
    buildHtmlIndex(outDir, results);

    const totalBytes = results.reduce((n, r) => n + r.bytes, 0);
    console.log(
      `shots=${results.length} elapsed_ms=${elapsedMs.toFixed(1)} total_bytes=${totalBytes}`,
    );
    for (const r of results) {
      console.log(`${r.md5}  ${r.bytes}  ${r.id}__${r.viewport}`);
    }

    if (results.length !== renderedStates().length * 2) {
      throw new Error(`expected ${renderedStates().length * 2} PNGs, got ${results.length}`);
    }
  } finally {
    await browser.close();
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
