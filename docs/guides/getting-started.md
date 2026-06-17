# Getting Started

> **Audience:** contributors & operators · **Purpose:** run, test, and deploy
> Pineapple · **Source of truth:** this file · **Last reviewed:** 2026-05-29

## Prerequisites

- Node.js 22+
- pnpm 10 (pinned via `packageManager`; `corepack enable` will provide it)
- A Cloudflare account (for deploy) and `wrangler` (installed as a dev dep)

## 1. Install

```bash
pnpm install
```

## 2. Local database

Apply migrations to your local D1 instance:

```bash
cd apps/api
pnpm wrangler d1 migrations apply pineapple --local
```

## 3. Local secrets (`apps/api/.dev.vars`)

This file is **gitignored** — never commit it. Minimum for local development:

```ini
# Any long random string locally: `openssl rand -base64 32`
BETTER_AUTH_SECRET=dev-only-change-me

# Leave blank until you set up Google OAuth (step 5)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Dev bypass (treat every request as this user, skipping the login flow + cookies).
# Add this (and ENVIRONMENT) to use the bypass so writes like POST /api/assets
# work without a real Google session. wrangler dev loads .dev.vars automatically.
ENVIRONMENT=development
DEV_AUTH_EMAIL=dev@example.com

# OAuth callbacks should return through Vite's same-origin /api proxy.
BETTER_AUTH_URL=http://localhost:5173
```

## 4. Run

Run the API Worker and web app in separate terminals:

```bash
pnpm --filter @snaveevans/pineapple-api dev   # http://localhost:8787
pnpm --filter @snaveevans/pineapple-web dev   # http://localhost:5173
```

The pnpm dev script (and .dev.vars) ensure `ENVIRONMENT=development` locally
so the DEV_AUTH_EMAIL bypass guard passes. Production uses the committed
`ENVIRONMENT=production` binding (and CI rejects any DEV_AUTH_EMAIL secret).

The browser should use `http://localhost:5173`. Vite proxies same-origin
`/api/*` requests to the API Worker. Try it:

```bash
curl http://localhost:8787/health                 # {"status":"ok"}
open http://localhost:8787/reference              # interactive API docs
curl http://localhost:8787/api/assets             # works via DEV_AUTH_EMAIL bypass
open http://localhost:5173/app/assets             # web app through the Vite proxy
```

## 5. Google OAuth (for the real login flow)

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
   ID** → type **Web application**.
2. **Authorized redirect URIs:**
   - `http://localhost:5173/api/auth/callback/google`
   - `https://<your-prod-domain>/api/auth/callback/google`
3. Put the client ID/secret in `.dev.vars` (local) and as Worker secrets (prod,
   step 7). Then sign in via
   `http://localhost:5173/api/auth/sign-in/social?provider=google`.

## 6. Quality gates

Run these before every commit (CI runs the same):

```bash
pnpm lint
pnpm type-check
pnpm -r test

# If you changed API schemas/routes, regenerate the committed spec:
pnpm --filter @snaveevans/pineapple-api openapi:generate
```

## 7. Deployment

Deployment is automatic: **merging to `main`** runs CI, applies pending D1
migrations to production, then `wrangler deploy`s the Worker (see
[ADR-0006](../decisions/0006-deployment-platform.md) and the workflows in
`.github/workflows/`).

Before applying migrations, the deploy job lists the production Worker's
secrets and fails if `DEV_AUTH_EMAIL` is present.

**One-time setup:**

- **GitHub Actions secrets** (the deploy credential): `CLOUDFLARE_API_TOKEN`
  (token with _Workers Scripts: Edit_ + _D1: Edit_) and `CLOUDFLARE_ACCOUNT_ID`.
  Set with `gh secret set <NAME> --repo <owner>/<repo>`.
- **Worker runtime secrets** (the app needs these at runtime — set once in
  Cloudflare, they persist across deploys and never go in GitHub):

  ```bash
  cd apps/api
  pnpm wrangler secret put BETTER_AUTH_SECRET
  pnpm wrangler secret put GOOGLE_CLIENT_ID
  pnpm wrangler secret put GOOGLE_CLIENT_SECRET
  ```

> **Two kinds of secrets, two homes.** The Cloudflare _API token_ lives in
> GitHub and lets CI deploy. The _OAuth/runtime_ secrets live in Cloudflare and
> are read by the running Worker. They never mix.

## Branch workflow

Work on a branch → open a PR → CI must pass → merge → auto-deploy. `main` is
protected (PR required, CI required, you can merge your own PRs). Don't push to
`main` directly.
