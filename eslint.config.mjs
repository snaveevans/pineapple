import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import n from "eslint-plugin-n";

// ── CF Workers: Node.js built-ins unavailable at runtime (ADR-0006) ─────────
const CF_WORKERS_NODE_MESSAGE =
  "Node.js built-in modules are not available in Cloudflare Workers. " +
  "Use WinterCG-compatible APIs instead. See ADR-0006.";

// Modules that are definitively absent in the Workers runtime.
// (crypto/buffer/streams/events have WinterCG equivalents — block only
//  the ones that have no CF Workers substitute at all.)
const BLOCKED_NODE_BUILTINS = [
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "dns/promises",
  "domain",
  "fs",
  "fs/promises",
  "http",
  "https",
  "inspector",
  "net",
  "os",
  "path",
  "perf_hooks",
  "readline",
  "tls",
  "v8",
  "vm",
  "worker_threads",
];

// Build the n/no-restricted-import list covering both bare and node: forms.
const BLOCKED_IMPORTS = BLOCKED_NODE_BUILTINS.flatMap((name) => [
  { name, message: CF_WORKERS_NODE_MESSAGE },
  { name: `node:${name}`, message: CF_WORKERS_NODE_MESSAGE },
]);

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────────────────
  // scripts/ are Node tooling (build-time), outside the Workers tsconfig.
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/scripts/**"] },

  // ── Layer boundary enforcement (ADR-0003) ────────────────────────────────
  // Elements map file paths → logical layer names.
  // The default "disallow" rule means a layer can only import from layers
  // explicitly listed in its `allow` entry.  The workspace package
  // @snaveevans/pineapple-shared resolves to packages/shared/** via the
  // TypeScript project service, so it is recognised as the "shared" element.
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "shared", pattern: "packages/shared/**" },
        { type: "domain", pattern: "apps/api/src/domain/**" },
        { type: "application", pattern: "apps/api/src/application/**" },
        { type: "infrastructure", pattern: "apps/api/src/infrastructure/**" },
        { type: "api-layer", pattern: "apps/api/src/api/**" },
        { type: "composition-root", pattern: "apps/api/src/worker.ts" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            // shared has no internal deps — intentionally omitted
            { from: { type: "domain" }, allow: [{ to: { type: "shared" } }] },
            {
              from: { type: "application" },
              allow: [{ to: { type: "domain" } }, { to: { type: "shared" } }],
            },
            {
              from: { type: "infrastructure" },
              allow: [
                { to: { type: "application" } },
                { to: { type: "domain" } },
                { to: { type: "shared" } },
              ],
            },
            {
              from: { type: "api-layer" },
              allow: [
                { to: { type: "application" } },
                { to: { type: "domain" } },
                { to: { type: "shared" } },
              ],
            },
            // composition root (worker.ts) is the wiring point — no restrictions
            { from: { type: "composition-root" }, allow: [{ to: { type: "*" } }] },
          ],
        },
      ],
    },
  },

  // ── Type-aware TypeScript linting ────────────────────────────────────────
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── CF Workers runtime constraint (ADR-0006) ─────────────────────────────
  // Flag any import of a Node.js built-in module inside the API app.
  // process.env is also blocked — use wrangler env bindings instead.
  {
    files: ["apps/api/src/**/*.ts"],
    plugins: { n },
    rules: {
      "n/no-restricted-import": ["error", BLOCKED_IMPORTS],
      "n/no-process-env": "error",
    },
  },

  // ── Non-type-aware linting for JS/CJS config files ───────────────────────
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: tseslint.configs.recommended,
  },

  prettier,
);
