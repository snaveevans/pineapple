> **Audience:** on-call (both of us) · **Purpose:** what to do when production is broken after a deploy · **Source of truth:** this file · **Last reviewed:** 2026-09-04

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

`wrangler rollback` re-activates the most recent **stable** version (one that
was previously deployed at 100% of traffic). It prompts for a reason — always
write one; it lands in the deployment history as the audit trail.

```bash
# API worker (serves /api/*, /openapi.json, /health, and the SPA catch-all —
# the API worker is almost always the one to roll back)
cd apps/api
pnpm wrangler rollback              # most recent stable version
pnpm wrangler versions list         # to pick a specific version instead
pnpm wrangler rollback <VERSION-ID> # that specific version

# Web worker (serves the built SPA assets)
cd apps/web
pnpm wrangler rollback
```

**Rollback can be blocked.** Per the Cloudflare docs, you cannot roll back to a
version if platform resources (KV, D1, R2, secrets) were **added, deleted, or
modified** since that version was deployed — the error names what changed. If
the bad deploy changed `wrangler.jsonc` bindings or secrets, the rollback
target may be out of reach; in that case fix-forward (revert the commit and
push, letting the deploy pipeline re-verify and re-deploy) and say so in the
incident notes.

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

Both green = the previous version is serving. These are the same assertions the
deploy workflow's smoke check makes.

## After the rollback

1. Open a `bug` issue with the smoke failure output (or user report) and the
   rollback reason from the deployment history.
2. Investigate before re-deploying — merging to `main` auto-deploys, so a fix
   lands through the normal pipeline (branch → PR → green CI → merge), at which
   point the new deploy supersedes the rollback.
3. If the failure was found by smoke rather than by a user, the blast radius was
   zero-traffic-visible — note that in the issue; it means the gate worked.
