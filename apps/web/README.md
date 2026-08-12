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
- **Activity History** (`/app/history`) — [`src/app/AppActivityHistory.tsx`](src/app/AppActivityHistory.tsx) —
  the owner-scoped event feed for assets, maintenance records, and scheduled
  task changes with server-provided filters and cursor pagination.

The authenticated pages share their chrome — the desktop top bar and mobile
bottom tab bar — via [`src/app/AppChrome.tsx`](src/app/AppChrome.tsx), where the
nav tabs link between `/app`, `/app/assets`, and `/app/history`.

The shared design-system primitives live in [`src/design/`](src/design/):

- `Icon`, `HFStatusPill`, `HFAssetIcon`, `HFAssetThumb` — domain chrome
- `Button`, `EmptyState`, `Field`, `Toolbar`, `Card` — layout/UI primitives
  (single CSS definitions in `design/styles/primitives.css`, imported by
  `hifi.css`)

Feature pages add thin layers on top (`marketing.css` `.mk`, `auth.css` `.au`,
page-specific sheets). Prefer composing the shared primitives over minting new
button/card/empty/field classes.

Routing uses React Router Data Mode. [`src/router.tsx`](src/router.tsx) owns the
route tree and [`src/routes.ts`](src/routes.ts) exports shared path helpers for
route-aware links and navigation. The Worker's SPA fallback (see
`wrangler.jsonc`) serves `index.html` for any path, so direct loads of `/login`,
`/app`, `/app/assets`, `/app/assets/new`, and `/app/history` resolve
client-side.

## Layout

```
index.html              # Vite HTML entry (loads Inter + JetBrains Mono)
src/main.tsx            # React bootstrap + RouterProvider
src/router.tsx          # React Router route tree (/, /login, /app, /app/assets, /app/assets/new, /app/history)
src/routes.ts           # shared route paths/path builders
src/design/             # shared design-system primitives + .hf CSS tokens
src/marketing/          # Marketing Home page + .mk CSS
src/auth/               # Auth Flow page (/login) + .au CSS
src/app/                # Authenticated app pages, AppChrome shared nav, activity history
src/api/                # API client; types generated from the OpenAPI spec (see below)
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
pnpm --filter @snaveevans/pineapple-web api:types    # regenerate src/api/schema.ts from the OpenAPI spec
```

## API client

`src/api/schema.ts` is generated from `docs/reference/openapi.json` and
committed; CI fails if it is stale. The modules beside it alias those generated
types and call the path-keyed helpers in `src/api/client.ts`:

```ts
apiGet("/api/assets/{id}", { path: { id } }); // response type comes from the spec
apiPost("/api/assets", { body }); // body type comes from the spec
```

The path literal determines the params, body, and response — there is no type
parameter to pick — so a contract change surfaces as a `type-check` failure
here instead of a runtime break in the browser. Don't hand-declare a shape the
spec already describes, and don't edit `schema.ts` by hand.

During local development, Vite proxies same-origin `/api/*` browser requests
to the API Worker at `http://localhost:8787`. Run the API separately with
`pnpm --filter @snaveevans/pineapple-api dev`. Set
`BETTER_AUTH_URL=http://localhost:5173` in `apps/api/.dev.vars` so OAuth
callbacks return through the proxy.

> Unlike `apps/api`, this app **has a build step** (Vite). It uses Web/DOM
> standard APIs in the Worker entry, so no `@cloudflare/workers-types` global
> is pulled in (which would conflict with `lib.dom`).
