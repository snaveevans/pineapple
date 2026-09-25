> **Audience:** on-call (both of us) · **Purpose:** what to do when production is broken after a deploy · **Source of truth:** this file · **Last reviewed:** 2026-09-24

# Rollback runbook

## When to roll back

- The **post-deploy smoke check** in `deploy.yml` fails (`deploy-api` job red
  after Deploy Worker) — the deployed API worker is not serving correctly.
- A user reports the app broken immediately after a merge to `main`.
- Analytics Engine telemetry shows a sustained error-rate spike following a
  deploy.

Roll back first, investigate second. A rollback is cheap and reversible; a
broken production is not.

## How: roll back a Worker

Roll back to a **specific known-good deployed version ID**, identified from the
deployment history. An unqualified `wrangler rollback` defaults to the version
uploaded before the latest version, which is not necessarily the release you
want. Wrangler prompts for a reason — always write one; it lands in the
deployment history as the audit trail. Start these commands from the repository
root. See [Cloudflare's Wrangler reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

```bash
# API worker (serves /api/*, /openapi.json, /health, and MCP routes)
cd apps/api
pnpm wrangler deployments list      # identify the known-good deployed version
pnpm wrangler rollback <VERSION-ID> # replace placeholder with that version ID

# Web worker (serves the built SPA assets)
cd ../web
pnpm wrangler deployments list
pnpm wrangler rollback <VERSION-ID>
```

**Rollback can be blocked.** Cloudflare may reject an older version when
connected resources or bindings changed incompatibly — for example, a required
bucket/queue no longer exists or a Durable Object class lifecycle changed.
If the recorded target is unavailable, fix-forward through a reviewed revert
or correction PR and the normal deploy pipeline, and note the reason in the
incident record. [Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## What a rollback does NOT undo

| Change                   | Survives rollback because                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applied D1 migrations    | Migrations are applied before the deploy and never auto-revert. Schema safety comes from [expand/contract](../specs/cross-cutting/schema-migrations.md): new schema stays compatible with the rolled-back code. |
| In-flight queue messages | Queues are provisioned infrastructure, not part of a version.                                                                                                                                                   |
| Sent email               | Already sent.                                                                                                                                                                                                   |

This is why the [change-safety epic](https://github.com/snaveevans/pineapple/issues/129)
frames rollback as one layer of several, not a full undo.

## Verify the rollback worked

```bash
curl -fsS https://pineapple.tylerevans.co/health | jq -e '.status == "ok" and .database == "reachable"'
curl -fsS https://pineapple.tylerevans.co/openapi.json | jq -e 'has("openapi") and has("paths")'
```

Both green show the API is serving; also confirm `/health.version` matches the
version selected for rollback. The two assertions above are the same ones the
deploy workflow's smoke check makes.

## After the rollback

1. Open a `bug` issue with the smoke failure output (or user report) and the
   rollback reason from the deployment history.
2. Investigate before re-deploying — merging to `main` auto-deploys, so a fix
   lands through the normal pipeline (branch → PR → green CI → merge), at which
   point the new deploy supersedes the rollback.
3. If smoke found the failure before a user report, assess traffic and error
   telemetry before claiming there was no user impact: the smoke check runs
   **after** the new version starts serving production traffic.
