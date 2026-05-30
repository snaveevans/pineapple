# @snaveevans/pineapple-web

The FieldOps web frontend — a Vite + React app served by a Cloudflare Worker
via [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/).
Adapted from Cloudflare's `vite-react-template` to fit this pnpm monorepo.

It serves these pages from the Claude Design handoff:

- **Marketing Home** (`/`) — [`src/marketing/`](src/marketing/)
- **Auth Flow** (`/login`) — [`src/auth/`](src/auth/) — Google-first log in /
  sign up (Better Auth, phase 1). Reads `?mode=login|signup` to pick its initial
  screen; the marketing CTAs deep-link with the matching mode.

- **App Home** (`/app`) — [`src/app/AppHome.tsx`](src/app/AppHome.tsx) — the
  authenticated master/detail home: greeting + fleet stats and an urgency-sorted
  service queue.
- **Assets** (`/app/assets`) — [`src/app/AppAssets.tsx`](src/app/AppAssets.tsx) —
  the asset library: a responsive card grid (stacked rows on mobile) with search,
  category filter chips, and a grid/list view toggle.

The authenticated pages share their chrome — the desktop top bar and mobile
bottom tab bar — via [`src/app/AppChrome.tsx`](src/app/AppChrome.tsx), where the
nav tabs link between `/app` and `/app/assets`.

The shared design-system primitives (`Icon`, `HFStatusPill`, `HFAssetIcon`,
`HFAssetThumb`) are ported from the FieldOps app prototype and live in
[`src/design/`](src/design/), styled by `design/styles/hifi.css` +
`hifi-assets.css` (the `.hf-*` tokens/components). Each page adds a thin layer
that mirrors those tokens onto its own scope: `marketing.css` (`.mk`) and
`auth.css` (`.au`). The `/app` pages render the `.hf` system directly.

Routing is a single `window.location.pathname` check in
[`src/main.tsx`](src/main.tsx) — no router dependency. The Worker's SPA
fallback (see `wrangler.jsonc`) serves `index.html` for any path, so `/login`,
`/app`, and `/app/assets` resolve client-side.

## Layout

```
index.html              # Vite HTML entry (loads Inter + JetBrains Mono)
src/main.tsx            # React bootstrap + path routing (/, /login, /app, /app/assets)
src/design/             # shared design-system primitives + .hf CSS tokens
src/marketing/          # Marketing Home page + .mk CSS
src/auth/               # Auth Flow page (/login) + .au CSS
src/app/                # Authenticated app: AppHome (/app), AppAssets (/app/assets), AppChrome (shared nav)
worker/index.ts         # Worker entry; reserves /api/*, SPA-falls-back otherwise
vite.config.ts          # react() + cloudflare() plugins
wrangler.jsonc          # Worker + static-assets config (SPA not_found_handling)
```

## Commands

```bash
pnpm --filter @snaveevans/pineapple-web dev         # vite dev server (http://localhost:5173)
pnpm --filter @snaveevans/pineapple-web build       # production build → dist/
pnpm --filter @snaveevans/pineapple-web preview      # preview the built worker locally
pnpm --filter @snaveevans/pineapple-web deploy       # build + wrangler deploy
```

> Unlike `apps/api`, this app **has a build step** (Vite). It uses Web/DOM
> standard APIs in the Worker entry, so no `@cloudflare/workers-types` global
> is pulled in (which would conflict with `lib.dom`).
