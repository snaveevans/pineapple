/**
 * Pixel-diff two gallery output directories (merge-base vs HEAD).
 *
 *   pnpm --filter @snaveevans/pineapple-web gallery:diff -- \
 *     --base apps/web/gallery/out-base \
 *     --head apps/web/gallery/out-head \
 *     --out apps/web/gallery/out-diff
 *
 * Threshold contract: docs/specs/cross-cutting/testing.md (§ Visual diff).
 * Color distance 0.1 (pixelmatch default); changed iff numDiffPixels > 0.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

/** pixelmatch YIQ color distance — see testing.md visual-diff section. */
export const COLOR_THRESHOLD = 0.1;

export const COMMENT_MARKER = "<!-- pineapple-web-visual-diff -->";

export type DiffStatus = "unchanged" | "changed" | "added" | "removed" | "resized";

export type DiffEntry = {
  file: string;
  id: string;
  viewport: string;
  status: DiffStatus;
  diffPixels: number;
  width: number;
  height: number;
  /** Relative path under --out when a highlighted diff PNG was written. */
  diffFile?: string;
  baseFile?: string;
  headFile?: string;
};

export type DiffSummary = {
  generatedAt: string;
  colorThreshold: number;
  baseDir: string;
  headDir: string;
  outDir: string;
  totalCompared: number;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  resizedCount: number;
  unchangedCount: number;
  entries: DiffEntry[];
};

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function resolvePath(raw: string | undefined, label: string): string {
  if (raw === undefined || raw === "") {
    throw new Error(`missing required ${label}`);
  }
  if (raw.startsWith("/")) return raw;
  return resolve(REPO_ROOT, raw);
}

/** Parse `asset-library__loading__desktop.png` → id + viewport. */
export function parseShotName(file: string): { id: string; viewport: string } {
  const base = basename(file, ".png");
  const idx = base.lastIndexOf("__");
  if (idx <= 0) {
    return { id: base.replaceAll("__", "/"), viewport: "unknown" };
  }
  const idPart = base.slice(0, idx);
  const viewport = base.slice(idx + 2);
  return { id: idPart.replaceAll("__", "/"), viewport };
}

function listPngs(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".png")) continue;
    map.set(name, join(dir, name));
  }
  return map;
}

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

export function diffPair(
  basePath: string | undefined,
  headPath: string | undefined,
  outDiffPath: string,
): Pick<DiffEntry, "status" | "diffPixels" | "width" | "height" | "diffFile"> {
  if (basePath === undefined && headPath !== undefined) {
    const head = readPng(headPath);
    writeHighlight(head, head, outDiffPath, "added");
    return {
      status: "added",
      diffPixels: head.width * head.height,
      width: head.width,
      height: head.height,
      diffFile: basename(outDiffPath),
    };
  }
  if (basePath !== undefined && headPath === undefined) {
    const base = readPng(basePath);
    writeHighlight(base, base, outDiffPath, "removed");
    return {
      status: "removed",
      diffPixels: base.width * base.height,
      width: base.width,
      height: base.height,
      diffFile: basename(outDiffPath),
    };
  }
  if (basePath === undefined || headPath === undefined) {
    throw new Error("diffPair requires at least one path");
  }

  const base = readPng(basePath);
  const head = readPng(headPath);

  if (base.width !== head.width || base.height !== head.height) {
    // Dimension change: write head with a solid red border strip so the comment
    // still has something to show; do not run pixelmatch on unequal buffers.
    writeHighlight(base, head, outDiffPath, "resized");
    return {
      status: "resized",
      diffPixels: Math.max(base.width * base.height, head.width * head.height),
      width: head.width,
      height: head.height,
      diffFile: basename(outDiffPath),
    };
  }

  const { width, height } = base;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(base.data, head.data, diff.data, width, height, {
    threshold: COLOR_THRESHOLD,
    includeAA: false,
  });

  if (diffPixels === 0) {
    return { status: "unchanged", diffPixels: 0, width, height };
  }

  writeFileSync(outDiffPath, PNG.sync.write(diff));
  return {
    status: "changed",
    diffPixels,
    width,
    height,
    diffFile: basename(outDiffPath),
  };
}

/** Write a simple highlight PNG when we cannot run a true pixelmatch. */
function writeHighlight(
  base: PNG,
  head: PNG,
  outPath: string,
  kind: "added" | "removed" | "resized",
): void {
  const src = kind === "removed" ? base : head;
  const out = new PNG({ width: src.width, height: src.height });
  // Tint toward red so the comment is obviously "this is a change marker".
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i] ?? 0;
    const g = src.data[i + 1] ?? 0;
    const b = src.data[i + 2] ?? 0;
    const a = src.data[i + 3] ?? 255;
    out.data[i] = Math.min(255, Math.round(r * 0.4 + 220 * 0.6));
    out.data[i + 1] = Math.round(g * 0.35);
    out.data[i + 2] = Math.round(b * 0.35);
    out.data[i + 3] = a;
  }
  void base;
  writeFileSync(outPath, PNG.sync.write(out));
}

export function runDiff(opts: { baseDir: string; headDir: string; outDir: string }): DiffSummary {
  if (existsSync(opts.outDir)) {
    rmSync(opts.outDir, { recursive: true, force: true });
  }
  mkdirSync(opts.outDir, { recursive: true });
  mkdirSync(join(opts.outDir, "diff"), { recursive: true });
  mkdirSync(join(opts.outDir, "base"), { recursive: true });
  mkdirSync(join(opts.outDir, "head"), { recursive: true });

  const baseMap = listPngs(opts.baseDir);
  const headMap = listPngs(opts.headDir);
  const names = new Set([...baseMap.keys(), ...headMap.keys()]);

  const entries: DiffEntry[] = [];

  for (const name of [...names].sort()) {
    const basePath = baseMap.get(name);
    const headPath = headMap.get(name);
    const { id, viewport } = parseShotName(name);
    const diffOut = join(opts.outDir, "diff", name);
    const result = diffPair(basePath, headPath, diffOut);

    const entry: DiffEntry = {
      file: name,
      id,
      viewport,
      status: result.status,
      diffPixels: result.diffPixels,
      width: result.width,
      height: result.height,
    };
    if (result.diffFile !== undefined) {
      entry.diffFile = `diff/${result.diffFile}`;
      // Copy base/head siblings next to the diff for the upload set.
      if (basePath !== undefined) {
        const dest = join(opts.outDir, "base", name);
        writeFileSync(dest, readFileSync(basePath));
        entry.baseFile = `base/${name}`;
      }
      if (headPath !== undefined) {
        const dest = join(opts.outDir, "head", name);
        writeFileSync(dest, readFileSync(headPath));
        entry.headFile = `head/${name}`;
      }
    } else if (existsSync(diffOut)) {
      rmSync(diffOut);
    }
    entries.push(entry);
  }

  const changed = entries.filter((e) => e.status !== "unchanged");
  const summary: DiffSummary = {
    generatedAt: new Date().toISOString(),
    colorThreshold: COLOR_THRESHOLD,
    baseDir: opts.baseDir,
    headDir: opts.headDir,
    outDir: opts.outDir,
    totalCompared: entries.length,
    changedCount: changed.filter((e) => e.status === "changed").length,
    addedCount: changed.filter((e) => e.status === "added").length,
    removedCount: changed.filter((e) => e.status === "removed").length,
    resizedCount: changed.filter((e) => e.status === "resized").length,
    unchangedCount: entries.length - changed.length,
    entries,
  };

  writeFileSync(join(opts.outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(opts.outDir, "comment.md"), buildCommentMarkdown(summary));
  return summary;
}

export function buildCommentMarkdown(
  summary: DiffSummary,
  opts?: {
    imageBaseUrl?: string;
    artifactOnly?: boolean;
    headSha?: string;
    prNumber?: number;
  },
): string {
  const lines: string[] = [COMMENT_MARKER, "## Web visual diff", ""];

  const delta =
    summary.changedCount + summary.addedCount + summary.removedCount + summary.resizedCount;

  if (delta === 0) {
    lines.push("**No visual change** across the state gallery.", "");
    lines.push(
      `<sub>Compared ${summary.totalCompared} shots · color threshold ${summary.colorThreshold} · numDiffPixels &gt; 0 counts as changed · [#146](https://github.com/snaveevans/pineapple/issues/146)</sub>`,
      "",
    );
    if (opts?.artifactOnly) {
      lines.push(
        "> Fork / no-credentials run: images were **not** uploaded to R2. Full gallery is on the workflow artifact `web-state-gallery`.",
        "",
      );
    }
    return lines.join("\n");
  }

  lines.push(
    `**${delta} changed** state/viewport triple${delta === 1 ? "" : "s"}` +
      ` (${summary.changedCount} pixel-diff` +
      `${summary.addedCount > 0 ? `, ${summary.addedCount} added` : ""}` +
      `${summary.removedCount > 0 ? `, ${summary.removedCount} removed` : ""}` +
      `${summary.resizedCount > 0 ? `, ${summary.resizedCount} resized` : ""}` +
      `) · ${summary.unchangedCount} unchanged.`,
    "",
  );

  if (opts?.artifactOnly) {
    lines.push(
      "> **Artifact only** — R2 credentials were unavailable (fork PR or missing secrets). Diff PNGs are on the workflow artifact `web-visual-diff`; images below are not inlined.",
      "",
    );
  }

  const changedEntries = summary.entries.filter((e) => e.status !== "unchanged");
  // Cap inline images so a runaway refactor does not blow the comment size limit.
  const INLINE_CAP = 30;
  const inline = changedEntries.slice(0, INLINE_CAP);
  const overflow = changedEntries.length - inline.length;

  for (const e of inline) {
    lines.push(`### \`${e.id}\` · ${e.viewport}`, "");
    lines.push(
      `- status: **${e.status}**` +
        (e.status === "changed" ? ` · ${e.diffPixels.toLocaleString()} px` : ""),
      "",
    );

    if (opts?.imageBaseUrl && e.diffFile) {
      const baseUrl = opts.imageBaseUrl.replace(/\/$/, "");
      const img = (rel: string | undefined, alt: string) => {
        if (!rel) return "";
        return `![${alt}](${baseUrl}/${rel})`;
      };
      // Stack vertically — phone-width friendly (no wide 3-col table).
      if (e.baseFile) {
        lines.push("**Base**", "", img(e.baseFile, `${e.id} base`), "");
      }
      if (e.headFile) {
        lines.push("**Head**", "", img(e.headFile, `${e.id} head`), "");
      }
      lines.push("**Diff**", "", img(e.diffFile, `${e.id} diff`), "");
    } else {
      lines.push(`- files: \`${e.file}\``, "");
    }
  }

  if (overflow > 0) {
    lines.push(`…and **${overflow}** more (see workflow artifact \`web-visual-diff\`).`, "");
  }

  const meta: string[] = [`threshold ${summary.colorThreshold}`, `${summary.totalCompared} shots`];
  if (opts?.headSha) meta.push(`sha \`${opts.headSha.slice(0, 7)}\``);
  if (opts?.prNumber !== undefined) meta.push(`PR #${opts.prNumber}`);
  lines.push(
    `<sub>${meta.join(" · ")} · Phase A non-blocking · [#146](https://github.com/snaveevans/pineapple/issues/146)</sub>`,
    "",
  );

  return lines.join("\n");
}

function main(): void {
  const baseDir = resolvePath(argValue("--base"), "--base");
  const headDir = resolvePath(argValue("--head"), "--head");
  const outDir = resolvePath(argValue("--out"), "--out");

  if (!existsSync(baseDir)) {
    throw new Error(`base dir does not exist: ${baseDir}`);
  }
  if (!existsSync(headDir)) {
    throw new Error(`head dir does not exist: ${headDir}`);
  }

  const summary = runDiff({ baseDir, headDir, outDir });
  const delta =
    summary.changedCount + summary.addedCount + summary.removedCount + summary.resizedCount;

  console.log(
    `diff: total=${summary.totalCompared} changed=${summary.changedCount} ` +
      `added=${summary.addedCount} removed=${summary.removedCount} ` +
      `resized=${summary.resizedCount} unchanged=${summary.unchangedCount} ` +
      `threshold=${summary.colorThreshold}`,
  );
  for (const e of summary.entries.filter((x) => x.status !== "unchanged")) {
    console.log(`  ${e.status}\t${e.diffPixels}\t${e.id}__${e.viewport}`);
  }

  // Phase A: never fail the process on visual findings.
  if (delta > 0) {
    console.log(`phase A: ${delta} visual change(s) reported (non-blocking)`);
  } else {
    console.log("phase A: no visual change");
  }
}

// Vitest imports this module; skip CLI entry when under the test runner.
if (process.env.VITEST === undefined) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
