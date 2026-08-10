/**
 * Rebuild the sticky PR comment body from summary.json after optional R2 upload.
 *
 *   node --experimental-strip-types gallery/report-comment.ts \
 *     --summary apps/web/gallery/out-diff/summary.json \
 *     --out apps/web/gallery/out-diff/comment.md \
 *     [--image-base-url https://pub-….r2.dev/pr/1/sha] \
 *     [--artifact-only] \
 *     [--head-sha abc] \
 *     [--pr 42]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommentMarkdown, type DiffSummary } from "./diff.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function resolvePath(raw: string | undefined, label: string): string {
  if (raw === undefined || raw === "") throw new Error(`missing ${label}`);
  if (raw.startsWith("/")) return raw;
  return resolve(REPO_ROOT, raw);
}

function main(): void {
  const summaryPath = resolvePath(argValue("--summary"), "--summary");
  const outPath = resolvePath(argValue("--out"), "--out");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as DiffSummary;

  const imageBaseUrl = argValue("--image-base-url");
  const headSha = argValue("--head-sha");
  const prRaw = argValue("--pr");
  const prNumber = prRaw !== undefined ? Number(prRaw) : undefined;

  const md = buildCommentMarkdown(summary, {
    ...(imageBaseUrl !== undefined ? { imageBaseUrl } : {}),
    ...(hasFlag("--artifact-only") ? { artifactOnly: true } : {}),
    ...(headSha !== undefined ? { headSha } : {}),
    ...(prNumber !== undefined && Number.isFinite(prNumber) ? { prNumber } : {}),
  });

  writeFileSync(outPath, md);
  const delta =
    summary.changedCount + summary.addedCount + summary.removedCount + summary.resizedCount;
  // Machine-readable line for GITHUB_OUTPUT consumers.
  console.log(`delta=${delta}`);
  console.log(`unchanged=${summary.unchangedCount}`);
  console.log(`wrote ${outPath}`);
}

main();
