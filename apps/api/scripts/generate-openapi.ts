// Emits the static OpenAPI document to docs/reference/openapi.json.
//
// Run via `pnpm --filter @snaveevans/pineapple-api openapi:generate` (tsx).
// CI regenerates and fails if the committed file drifts from the code, so the
// static spec — what codebase-reading tools (e.g. Claude design) see — always
// matches the live API served at /openapi.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getApiDocument } from "../src/api/openapi.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../../../docs/reference/openapi.json");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(getApiDocument(), null, 2) + "\n");

console.log(`Wrote ${outPath}`);
