# @snaveevans/pineapple-web

The FieldOps web frontend — a Vite + React app served by a Cloudflare Worker
via [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/).
Adapted from Cloudflare's `vite-react-template` to fit this pnpm monorepo.

Currently it serves the **Marketing Home** (logged-out landing) page,
implemented in [`src/marketing/`](src/marketing/) from the Claude Design
handoff. The design system primitives (`Icon`, `HFStatusPill`, `HFAssetIcon`,
`HFAssetThumb`) are ported from the FieldOps app prototype and styled by the
three CSS layers in `src/marketing/styles/` (`hifi.css` + `hifi-assets.css`
supply the `.hf-*` tokens/components; `marketing.css` is the `.mk-*` layer and
mirrors the tokens onto `.mk`).

## Layout

```
index.html              # Vite HTML entry (loads Inter + JetBrains Mono)
src/main.tsx            # React bootstrap → <MarketingHome />
src/marketing/          # page, primitives, and CSS
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
