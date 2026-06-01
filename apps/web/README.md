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
- **Add Asset** (`/app/assets/new`) — [`src/app/AppAddAsset.tsx`](src/app/AppAddAsset.tsx) —
  the add-asset form: a three-bucket type picker (Vehicle / Property / Other)
  with contextual detail fields, an optional photo dropzone, a deferred
  "set up a schedule" note, and a sticky save bar. The "Add asset" buttons and
  the ghost add-card on the Assets page link here; `esc` cancels back.

The authenticated pages share their chrome — the desktop top bar and mobile
bottom tab bar — via [`src/app/AppChrome.tsx`](src/app/AppChrome.tsx), where the
nav tabs link between `/app` and `/app/assets`.

The shared design-system primitives (`Icon`, `HFStatusPill`, `HFAssetIcon`,
`HFAssetThumb`) are ported from the FieldOps app prototype and live in
[`src/design/`](src/design/), styled by `design/styles/hifi.css` +
`hifi-assets.css` + `hifi-add-asset.css` (the `.hf-*` tokens/components). Each page adds a thin layer
that mirrors those tokens onto its own scope: `marketing.css` (`.mk`) and
`auth.css` (`.au`). The `/app` pages render the `.hf` system directly.

Routing uses React Router Data Mode. [`src/router.tsx`](src/router.tsx) owns the
route tree and [`src/routes.ts`](src/routes.ts) exports shared path helpers for
route-aware links and navigation. The Worker's SPA fallback (see
`wrangler.jsonc`) serves `index.html` for any path, so direct loads of `/login`,
`/app`, `/app/assets`, and `/app/assets/new` resolve client-side.

## Layout

```
index.html              # Vite HTML entry (loads Inter + JetBrains Mono)
src/main.tsx            # React bootstrap + RouterProvider
src/router.tsx          # React Router route tree (/, /login, /app, /app/assets, /app/assets/new)
src/routes.ts           # shared route paths/path builders
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

During local development, Vite proxies same-origin `/api/*` browser requests
to the API Worker at `http://localhost:8787`. Run the API separately with
`pnpm --filter @snaveevans/pineapple-api dev`. Set
`BETTER_AUTH_URL=http://localhost:5173` in `apps/api/.dev.vars` so OAuth
callbacks return through the proxy.

> Unlike `apps/api`, this app **has a build step** (Vite). It uses Web/DOM
> standard APIs in the Worker entry, so no `@cloudflare/workers-types` global
> is pulled in (which would conflict with `lib.dom`).
