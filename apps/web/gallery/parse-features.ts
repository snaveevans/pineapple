import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type GalleryMarkerKind = "excluded" | "deferred";

export type ParsedFeatureState = {
  id: string;
  screen: string;
  state: string;
  sourceFile: string;
  marker: { kind: GalleryMarkerKind; issue: number } | null;
};

const GALLERY_MARKER_RE = /\[gallery:(excluded|deferred)\s+#(\d+)\]/g;

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

function extractMarker(afterDash: string): { kind: GalleryMarkerKind; issue: number } | null {
  GALLERY_MARKER_RE.lastIndex = 0;
  const match = GALLERY_MARKER_RE.exec(afterDash);
  if (match === null) return null;
  const kind = match[1];
  const issueRaw = match[2];
  if (kind !== "excluded" && kind !== "deferred") return null;
  if (issueRaw === undefined) return null;
  return { kind, issue: Number(issueRaw) };
}

function parseBulletLine(
  line: string,
): { before: string; marker: ParsedFeatureState["marker"] } | null {
  const bullet = line.match(/^\s*-\s+(.*)$/);
  if (bullet === null || bullet[1] === undefined) return null;
  const body = bullet[1];
  const dashIdx = body.search(/\s+—\s+/);
  if (dashIdx === -1) {
    // Bullets without an em-dash still count (e.g. plain layout states).
    return { before: body, marker: null };
  }
  const before = body.slice(0, dashIdx).trim();
  const after = body.slice(dashIdx + 1);
  return { before, marker: extractMarker(after) };
}

function parseInlineItems(body: string, separator: ";" | "·"): string[] {
  return body
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) =>
      // Drop parenthetical asides but keep surrounding words:
      // "unset (empty optional field…)" → "unset"
      // "long address (street + city) on cards" → "long address on cards"
      part
        .replace(/\([^)]*\)/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((part) => part.length > 0);
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
        for (const item of parseInlineItems(body, sep)) {
          push(item, null);
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

    const parsed = parseBulletLine(line);
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
