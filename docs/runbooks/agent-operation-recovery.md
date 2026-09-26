# Agent operation recovery

Use this procedure only for an authorized incident where a committed MCP field
operation must be compensated. Recovery is an operator-only D1 CLI. There is no
HTTP or MCP recovery endpoint, and the private journal snapshots are never
printed by these commands.

## Preconditions

1. Confirm the API deployment containing the journal and recovery code is live,
   and the production D1 migration for the journal has completed. Do not use
   this CLI against a database whose Worker still accepts writes without
   journaling them.
2. Confirm the account owner and incident record. Obtain the actor UUID and
   operation UUID from a trusted safe receipt or incident record. Verify the
   actor identity using the normal operator access process; the CLI is
   actor-scoped but does not replace that identity check.
3. Run from a trusted checkout with the repository's pinned Node version and
   dependencies installed. Use the existing Wrangler OAuth login for the
   intended Cloudflare account; this procedure needs no new token or broader
   permission. If a stale `CLOUDFLARE_API_TOKEN` in the shell shadows that
   login, unset it for the command with `env -u CLOUDFLARE_API_TOKEN` rather
   than creating or copying another credential. The dedicated config binds
   only the `pineapple` D1 database remotely; it contains no secrets and is not
   a deployment config.
4. If the operation depends on a later operation on the same row, recover the
   later operation first. Reverse task/record dependencies before their
   originating task or asset. The planner proves the snapshot chain and refuses
   an incomplete or inconsistent chain.

## Inspect and plan

Use the same actor and operation UUID for each command. Replace the examples
with the verified UUIDs; do not paste private snapshots, free-form notes, or
street details into shell history.

```bash
pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts inspect --actor 239f68c0-c6a2-4550-8c5b-30e0f66fe7e2 --operation 188e5572-a712-4b1d-9f67-a260214ef953
pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts dry-run --actor 239f68c0-c6a2-4550-8c5b-30e0f66fe7e2 --operation 188e5572-a712-4b1d-9f67-a260214ef953
```

`inspect` reports only the tool, timestamps, and affected/changed row counts.
`dry-run` defaults to read-only and reports `dry_run_ready` or safe reason codes
such as `current_state_changed`, `dependent_data_exists`,
`incomplete_snapshot`, or `unsupported_snapshot`. A `blocked` result is a stop
condition. Do not retry with modified database state or bypass a guard; inspect
the incident and determine the appropriate later operation to recover first.

Before applying, review the target actor, operation, tool, and dry-run report
against the incident record. If the report is ready, apply using the explicit
operation-specific confirmation token:

```bash
pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts apply --actor 239f68c0-c6a2-4550-8c5b-30e0f66fe7e2 --operation 188e5572-a712-4b1d-9f67-a260214ef953 --confirm-restore 188e5572-a712-4b1d-9f67-a260214ef953
```

Apply builds a fresh plan and rechecks current rows, dependencies, the journal
chain, and the target's unrestored status inside the same D1 transaction as
compensation. If anything changed after dry-run, it returns `blocked` and rolls
back. Do not retry blindly; run inspect and dry-run again, then reassess the
incident. Successful compensation increments revisions and, for an asset,
updates `updated_at`; it does not decrement revisions or erase the original
activity timeline. Task schedule conclusions are written to the notification
outbox for normal delivery with an occurrence time strictly later than the
durable task-event history. The normal consumer can therefore ignore a delayed
older mutation event even if it arrives after the compensation.

## Verify and record

1. Run `inspect` again; the operation should report `restored` with a
   `restoredAt` timestamp.
2. Verify the intended current field state in the normal authenticated Pineapple
   interface and confirm any task schedule notification is delivered through
   its normal pipeline. Do not copy raw journal snapshots into tickets, chat,
   shell output, or deployment logs.
3. Record the actor UUID, operation UUID, tool, timestamps, safe report status,
   reason codes (if any), and verification outcome in the incident record.
   Never include the input hash, raw input, receipts with private fields, or
   snapshots.

The CLI is a Node-only operator tool backed by Wrangler `getPlatformProxy` and a
remote D1 binding. Do not expose it through a Worker route, MCP tool, HTTP
server, scheduled job, or queue consumer.
