# Agent Handoff

## Project Intent

This repository is for **FieldOps**, a personal learning project that is intended to become production-grade over time.

Primary intent:

- learn distributed/backend architecture in a disciplined order
- start with a **modular monolith**
- build on **Cloudflare** first
- use a real deployable system, not a toy app
- leave room for a future UI
- keep the backend architecture clean enough to later add a database and non-Cloudflare services

The source spec is:

- [`fieldops-backend-learning-spec.md`](/Users/tyler/workspace/pineapple/fieldops-backend-learning-spec.md)

## Product Direction

FieldOps is a real-time maintenance/task coordination app for a family property operation or small handyman crew.

Planned capabilities from the spec:

- REST API first
- Better Auth later
- D1 relational data later
- Queues later
- Durable Objects and WebSockets later
- GraphQL only after REST is stable
- one future synchronous service boundary for learning service-to-service communication

## Key Architectural Decisions Already Made

- Start as a **single deployable Worker** with clean internal layering.
- Use a **workspace-ready repo** now so a future UI has a place to live without a disruptive repo migration.
- Keep the current implementation **API-only** for now.
- Use **Hono + Wrangler + TypeScript**.
- Use **pnpm** as package manager.
- Use **GitHub Actions** for explicit CI/CD rather than Cloudflare git integration.
- Use the custom domain **`pineapple.tylerevans.co`** for the app.
- Keep the same hostname for the future UI and API.

## Important Implementation Note

The original plan was to use Cloudflare C3 with a Hono starter. In practice, the current C3 Hono path produced a full-stack scaffold instead of the API-only Worker shape we wanted.

Because of that, the actual implementation used the official `create-hono` Cloudflare Workers starter for `apps/api`, then normalized it into the Phase 0 structure.

This decision is recorded in:

- [`docs/decisions/0001-phase-0-scaffold.md`](/Users/tyler/workspace/pineapple/docs/decisions/0001-phase-0-scaffold.md)

## What Has Been Implemented

### Repository/Foundation

- git repo initialized
- root workspace scaffold created
- `pnpm` workspace configured
- shared ESLint / Prettier / TypeScript config added
- root docs structure added

Key files:

- [`package.json`](/Users/tyler/workspace/pineapple/package.json)
- [`pnpm-workspace.yaml`](/Users/tyler/workspace/pineapple/pnpm-workspace.yaml)
- [`tsconfig.base.json`](/Users/tyler/workspace/pineapple/tsconfig.base.json)
- [`eslint.config.mjs`](/Users/tyler/workspace/pineapple/eslint.config.mjs)
- [`prettier.config.cjs`](/Users/tyler/workspace/pineapple/prettier.config.cjs)
- [`README.md`](/Users/tyler/workspace/pineapple/README.md)

### App Layout

The current repo shape is:

- `apps/api`: active Worker API
- `apps/web`: placeholder only
- `packages`: placeholder only

Relevant files:

- [`apps/web/README.md`](/Users/tyler/workspace/pineapple/apps/web/README.md)
- [`packages/README.md`](/Users/tyler/workspace/pineapple/packages/README.md)

### API Worker

Implemented in `apps/api`:

- typed Hono app composition
- root route
- `/api/v1/health`
- request ID middleware
- simple structured request logging
- Wrangler config
- generated Cloudflare worker types

Relevant files:

- [`apps/api/src/app.ts`](/Users/tyler/workspace/pineapple/apps/api/src/app.ts)
- [`apps/api/src/index.ts`](/Users/tyler/workspace/pineapple/apps/api/src/index.ts)
- [`apps/api/src/env.ts`](/Users/tyler/workspace/pineapple/apps/api/src/env.ts)
- [`apps/api/src/middleware/request-id.ts`](/Users/tyler/workspace/pineapple/apps/api/src/middleware/request-id.ts)
- [`apps/api/src/lib/logger.ts`](/Users/tyler/workspace/pineapple/apps/api/src/lib/logger.ts)
- [`apps/api/src/routes/health.ts`](/Users/tyler/workspace/pineapple/apps/api/src/routes/health.ts)
- [`apps/api/wrangler.jsonc`](/Users/tyler/workspace/pineapple/apps/api/wrangler.jsonc)
- [`apps/api/worker-configuration.d.ts`](/Users/tyler/workspace/pineapple/apps/api/worker-configuration.d.ts)

### Testing

Implemented:

- Workers-native Vitest config
- health endpoint coverage
- request ID propagation/generation coverage

Relevant files:

- [`apps/api/vitest.config.mts`](/Users/tyler/workspace/pineapple/apps/api/vitest.config.mts)
- [`apps/api/tests/health.test.ts`](/Users/tyler/workspace/pineapple/apps/api/tests/health.test.ts)

### CI / Deployment

Implemented:

- GitHub Actions check workflow for pull requests
- GitHub Actions deployment workflow for pushes to `main` and manual dispatch

Relevant files:

- [`ci.yml`](/Users/tyler/workspace/pineapple/.github/workflows/ci.yml)
- [`deploy-api.yml`](/Users/tyler/workspace/pineapple/.github/workflows/deploy-api.yml)

### Domain Routing

Configured:

- Worker custom domain route for `pineapple.tylerevans.co`

Current intended shape:

- `https://pineapple.tylerevans.co/api/v1/*` for API
- `https://pineapple.tylerevans.co/` still returns the Worker metadata response until the UI exists

Relevant file:

- [`apps/api/wrangler.jsonc`](/Users/tyler/workspace/pineapple/apps/api/wrangler.jsonc)

## Local Tooling Behavior

- Root dev command: `pnpm dev`
- The local Worker dev server was pinned to port `8790` because `8787` was already in use on this machine during setup.
- Root check command: `pnpm check`

Relevant docs:

- [`README.md`](/Users/tyler/workspace/pineapple/README.md)

## Verification Status

Verified locally:

- `pnpm check` passes
- `pnpm dev` boots successfully on `http://localhost:8790`

Compatibility date note:

- `apps/api/wrangler.jsonc` is aligned to `2026-03-10`, matching the local Workers test/runtime support noted during setup

## Commits So Far

Committed history:

- `2d36e50` `chore: scaffold phase 0 workspace`
- `86fdb68` `chore: add AGENTS.md`
- `502afc8` `feat: add pineapple custom domain routing`

## GitHub Actions Deployment

The repository now has an explicit GitHub Actions production deployment workflow.

Current behavior:

- [`ci.yml`](/Users/tyler/workspace/pineapple/.github/workflows/ci.yml) runs checks on pull requests
- [`deploy-api.yml`](/Users/tyler/workspace/pineapple/.github/workflows/deploy-api.yml) runs checks, then deploys on `push` to `main` and on manual dispatch
- the `deploy` job is attached to the GitHub Actions `production` environment
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are expected in that environment and are verified before deploy
- the workflow does not run an automatic post-deploy smoke test

Manual post-deploy health check:

```sh
curl https://pineapple.tylerevans.co/api/v1/health
```

This deploy approach was chosen because the user explicitly wants **explicit CI/CD**, especially because the future system is expected to include a database and/or services outside Cloudflare.

## GitHub / Billing Discussion

We discussed whether GitHub Actions deployment requires an org.

Conclusion:

- a **personal GitHub account is fine**
- no org is required just to use GitHub Actions
- public repos are generally fine on a personal account
- private repos on GitHub Free still have limited included Actions minutes

The user still chose explicit GitHub Actions over Cloudflare git integration for control and future extensibility.

## Future Direction

Near-term likely next steps:

1. keep the GitHub Actions `production` environment configured with:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
2. use `push` to `main` or manual dispatch when a production deploy is needed
3. run the manual post-deploy health check after each deploy:
   - `curl https://pineapple.tylerevans.co/api/v1/health`

After deployment is stable, the next major backend steps from the project spec are likely:

1. D1 setup and first migration
2. Better Auth integration
3. protected `/api/v1/me`-style endpoint
4. team bootstrap flow
5. property/task CRUD foundation

## Future UI Direction

The user wants room for a UI but does not want frontend implementation yet.

Current assumption:

- future UI will live under `apps/web`
- it will likely be Cloudflare-hosted
- it should ultimately share the same public hostname family around `pineapple.tylerevans.co`

When the UI is added later, the open architectural question is:

- serve UI and API from one Worker, or
- place a web-facing Worker in front and proxy `/api/*` to the API Worker

That decision has not been implemented yet.

## Intent for the Next Agent

The next agent should assume:

- this is a serious learning project intended for production
- the user values explicit architecture and wants to understand distributed/backend concepts incrementally
- the codebase should stay clean, layered, and conservative
- avoid prematurely adding D1/auth/queues/DOs until the relevant phase begins
- preserve the workspace-ready shape because the future UI matters
- explicit CI/CD is preferred over managed magic

## Recommended Immediate Next Action

Start by reviewing the current deployment workflow and deployment docs:

- [`deploy-api.yml`](/Users/tyler/workspace/pineapple/.github/workflows/deploy-api.yml)
- [`ci.yml`](/Users/tyler/workspace/pineapple/.github/workflows/ci.yml)
- [`README.md`](/Users/tyler/workspace/pineapple/README.md)

If deployment behavior changes again, update `README.md` and `docs/handoff.md` in the same slice, then run the manual production health check:

`curl https://pineapple.tylerevans.co/api/v1/health`
