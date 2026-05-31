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

# Local Better Auth URL and cross-port web origin.
BETTER_AUTH_URL=http://localhost:8787
DEV_WEB_ORIGIN=http://localhost:5173

# Dev bypass: treat every request as this user, skipping the login flow.
# Both values are required. Remove them to exercise the real Google session
# flow. They only work with a loopback BETTER_AUTH_URL. NEVER set in production.
DEV_AUTH_BYPASS_ENABLED=true
DEV_AUTH_EMAIL=you@example.com
```

For the web app, copy the development-only API URL:

```bash
cp apps/web/.env.example apps/web/.env.development.local
```

Production web builds reject `VITE_API_URL`; deployed web and API requests are
same-origin.

## 4. Run

```bash
pnpm dev        # from repo root → http://localhost:8787
pnpm --filter @snaveevans/pineapple-web dev  # web → http://localhost:5173
```

Try it:

```bash
curl http://localhost:8787/health                 # {"status":"ok"}
open http://localhost:8787/reference              # interactive API docs
curl http://localhost:8787/api/assets             # works via the local bypass
```

## 5. Google OAuth (for the real login flow)

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
   ID** → type **Web application**.
2. **Authorized redirect URIs:**
   - `http://localhost:8787/api/auth/callback/google`
   - `https://<your-prod-domain>/api/auth/callback/google`
3. Put the client ID/secret in `.dev.vars` (local) and as Worker secrets (prod,
   step 7). Then sign in via
   `http://localhost:8787/api/auth/sign-in/social?provider=google`.

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
