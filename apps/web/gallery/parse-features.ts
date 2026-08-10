import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type GalleryMarkerKind = "excluded";

export type ParsedFeatureState = {
  id: string;
  screen: string;
  state: string;
  sourceFile: string;
  marker: { kind: GalleryMarkerKind; issue: number } | null;
};

/** Only `excluded` remains — deferred hatch deleted on #193. */
const GALLERY_MARKER_RE = /\[gallery:(excluded)\s+#(\d+)\]/g;
const REMOVED_DEFERRED_MARKER_RE = /\[gallery:deferred\s+#\d+\]/;

const SKIP_BLOCKS = new Set([
  "route",
  "goal",
  "exceptions",
  "non-obvious behavior",
  "spec",
  "entry points",
]);

type BlockKind =
  | "states"
  | "own-async"
  | "mutations"
  | "add-service-drawer"
  | "local"
  | "content-stress"
  | "notice"
  | "contact-email"
  | "skip"
  | "unknown";

function normalizeHeading(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toKebabState(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[`'']/g, "")
    .replace(/[()]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function classifyBlock(title: string): BlockKind {
  const t = title.trim().toLowerCase();
  if (t === "states") return "states";
  if (t.startsWith("own async states")) return "own-async";
  if (t === "mutations") return "mutations";
  if (t.startsWith("add-service drawer")) return "add-service-drawer";
  if (t.startsWith("local ui states")) return "local";
  if (t === "content stress") return "content-stress";
  if (t.startsWith("notice states")) return "notice";
  if (t.startsWith("contact-email value sub-states")) return "contact-email";
  if (SKIP_BLOCKS.has(t) || [...SKIP_BLOCKS].some((s) => t.startsWith(s))) return "skip";
  return "unknown";
}

function blockPrefix(kind: BlockKind): string {
  switch (kind) {
    case "mutations":
      return "mutation-";
    case "add-service-drawer":
      return "add-service-drawer-";
    case "local":
      return "local-";
    case "content-stress":
      return "content-stress-";
    case "notice":
      return "notice-";
    case "contact-email":
      return "contact-email-";
    default:
      return "";
  }
}

function extractMarker(
  text: string,
  sourceFile: string,
  lineNo?: number,
): { kind: GalleryMarkerKind; issue: number } | null {
  if (REMOVED_DEFERRED_MARKER_RE.test(text)) {
    const where = lineNo !== undefined ? `${sourceFile}:${lineNo}` : sourceFile;
    throw new Error(
      `${where}: [gallery:deferred #N] is no longer valid — the deferred hatch was deleted on #193; use rendered or [gallery:excluded #N]`,
    );
  }
  GALLERY_MARKER_RE.lastIndex = 0;
  const match = GALLERY_MARKER_RE.exec(text);
  if (match === null) return null;
  const kind = match[1];
  const issueRaw = match[2];
  if (kind !== "excluded") return null;
  if (issueRaw === undefined) return null;
  return { kind, issue: Number(issueRaw) };
}

/** Strip a gallery marker from inline-prose item text so it never enters the id. */
function stripInlineMarker(
  raw: string,
  sourceFile: string,
): { text: string; marker: ParsedFeatureState["marker"] } {
  const marker = extractMarker(raw, sourceFile);
  const text = raw.replace(GALLERY_MARKER_RE, " ").replace(/\s+/g, " ").trim();
  return { text, marker };
}

function parseBulletLine(
  line: string,
  sourceFile: string,
  lineNo: number,
): { before: string; marker: ParsedFeatureState["marker"] } | null {
  const bullet = line.match(/^\s*-\s+(.*)$/);
  if (bullet === null || bullet[1] === undefined) return null;
  const body = bullet[1];
  const dashIdx = body.search(/\s+—\s+/);
  if (dashIdx === -1) {
    // Bullets without an em-dash still count (e.g. plain layout states).
    // Still reject a removed deferred marker if someone stuck one here.
    extractMarker(body, sourceFile, lineNo);
    return { before: body, marker: null };
  }
  const before = body.slice(0, dashIdx).trim();
  const after = body.slice(dashIdx + 1);
  return { before, marker: extractMarker(after, sourceFile, lineNo) };
}

function parseInlineItems(
  body: string,
  separator: ";" | "·",
  sourceFile: string,
): Array<{ text: string; marker: ParsedFeatureState["marker"] }> {
  const out: Array<{ text: string; marker: ParsedFeatureState["marker"] }> = [];
  for (const part of body.split(separator)) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    // Marker first (so it never enters the kebab id), then drop parentheticals:
    // "unset (empty optional field…)" → "unset"
    // "saved (…) `[gallery:excluded #201]`" → text "saved", marker excluded
    const { text: withoutMarker, marker } = stripInlineMarker(trimmed, sourceFile);
    const text = withoutMarker
      .replace(/\([^)]*\)/g, " ")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length === 0) continue;
    out.push({ text, marker });
  }
  return out;
}

export function resolveFeatureFiles(paths: string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (name.endsWith(".md")) files.push(join(p, name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

export function parseFeaturesMarkdown(source: string, sourceFile: string): ParsedFeatureState[] {
  const lines = source.split(/\r?\n/);
  const firstHeading = lines.findIndex((l) => l.startsWith("## "));
  if (firstHeading === -1) return [];

  const out: ParsedFeatureState[] = [];
  let screen = "";
  let block: BlockKind = "skip";
  const seen = new Set<string>();

  const push = (stateRaw: string, marker: ParsedFeatureState["marker"]) => {
    if (screen === "") {
      throw new Error(`${sourceFile}: state outside a ## screen heading: ${stateRaw}`);
    }
    const state = `${blockPrefix(block)}${toKebabState(stateRaw)}`;
    if (state === "" || state === blockPrefix(block).replace(/-$/, "")) {
      throw new Error(`${sourceFile}: empty state id from ${JSON.stringify(stateRaw)}`);
    }
    const id = `${screen}/${state}`;
    if (seen.has(id)) {
      throw new Error(`${sourceFile}: duplicate state id ${id}`);
    }
    seen.add(id);
    out.push({ id, screen, state, sourceFile, marker });
  };

  for (let i = firstHeading; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line.startsWith("## ")) {
      screen = normalizeHeading(line.slice(3));
      block = "skip";
      continue;
    }

    // `**Title:** body`  OR  `**Title** (note):`  OR  `**Title**:`
    const boldColonInside = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    const boldColonOutside = line.match(/^\*\*([^*]+)\*\*[^{}\n]*?:\s*(.*)$/);
    const bold = boldColonInside ?? boldColonOutside;
    if (bold !== null && bold[1] !== undefined) {
      const title = bold[1];
      const rest = bold[2] ?? "";
      const kind = classifyBlock(title);
      if (kind === "unknown") {
        throw new Error(
          `${sourceFile}:${i + 1}: unrecognised FEATURES block "**${title}:**" — parse it or add it to the skip list deliberately`,
        );
      }
      block = kind;

      if (kind === "content-stress" || kind === "notice" || kind === "contact-email") {
        const sep = kind === "content-stress" ? ";" : "·";
        // Body may continue on following non-empty, non-heading, non-bullet lines.
        let body = rest;
        let j = i + 1;
        while (j < lines.length) {
          const next = lines[j];
          if (next === undefined) break;
          if (
            next.trim() === "" ||
            next.startsWith("#") ||
            next.startsWith("**") ||
            next.match(/^\s*-\s+/)
          ) {
            break;
          }
          body = `${body} ${next.trim()}`;
          j++;
        }
        for (const item of parseInlineItems(body, sep, sourceFile)) {
          push(item.text, item.marker);
        }
        // Do not leave the block open for subsequent bullets.
        block = "skip";
        i = j - 1;
      }
      continue;
    }

    if (block === "skip") continue;
    if (
      block !== "states" &&
      block !== "own-async" &&
      block !== "mutations" &&
      block !== "add-service-drawer" &&
      block !== "local"
    ) {
      continue;
    }

    const parsed = parseBulletLine(line, sourceFile, i + 1);
    if (parsed === null) continue;
    push(parsed.before, parsed.marker);
  }

  return out;
}

export function parseFeatureFiles(paths: string[]): ParsedFeatureState[] {
  const files = resolveFeatureFiles(paths);
  const all: ParsedFeatureState[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const states = parseFeaturesMarkdown(readFileSync(file, "utf8"), file);
    for (const s of states) {
      if (seen.has(s.id)) {
        throw new Error(`duplicate state id ${s.id} across feature files`);
      }
      seen.add(s.id);
      all.push(s);
    }
  }
  return all;
}

/** Default sources — list/glob so #190's split is a config change. */
export const DEFAULT_FEATURE_SOURCES = ["docs/web/FEATURES.md"];
