---
audience: product and engineering
purpose: atomically retain and safely restore Pineapple agent mutations without an end-user undo interface
source: this file
date: 2026-09-25
---

# Agent Operation Recovery

**Status:** `review`
**Owner:** Tyler Evans
**Related Intent:** [ChatGPT Field Operations](../../intents/features/chatgpt-field-operations.md) (`accepted`)
**Related Issues:** [#298](https://github.com/snaveevans/pineapple/issues/298), [#299](https://github.com/snaveevans/pineapple/issues/299)
**Ready Gate:** `approved 2026-09-25`
**Related Specs:** [ChatGPT Field Operations](chatgpt-field-operations.md), [Permissions](../cross-cutting/permissions.md), [Schema Migrations](../cross-cutting/schema-migrations.md), [Maintenance Task](maintenance-task.md), [Maintenance Record](maintenance-record.md), [Activity History](activity-history.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0017](../../decisions/0017-expand-contract-schema-migrations.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

## Summary

Every MCP write is a named operation with durable recovery evidence and a retry-safe receipt. Operators can restore affected domain state through a guarded maintenance procedure; no restore or delete tool is exposed to an agent. Activity History continues to be a timeline. Its incomplete snapshots are not treated as a complete recovery record.

## Architecture

Use an additive private operation journal in D1. A committed operation stores the authenticated actor, client-generated operation UUID, tool name, canonical payload hash, safe receipt, creation time, and full before/after snapshots of every changed asset, task, and record. Street details can exist in these protected snapshots, never in receipts, telemetry, or MCP output. Recovery entries live for the account's lifetime.

The journal transaction includes domain row changes, optimistic/access assertions, activity and notification outbox inserts, the receipt, and snapshots in one D1 batch. A failed assertion or write rolls the entire batch back. A journal entry is finalized only after that same transaction applies the mutation; no durable pending entry can strand retries. Existing application use cases still decide permissions, validation, event content, and schedule arithmetic. Infrastructure stages their writes and events, commits through the journal, then publishes telemetry/domain handlers only for a newly committed operation.

Replay uses actor plus operation UUID. Canonical JSON normalizes object key order, preserves array order and absent-versus-null meaning, and excludes no behavior-affecting fields. SHA-256 binds tool and full validated input. Replays reauthorize current access to the parent asset before returning a safe receipt. Identical IDs on separate users are independent. A changed tool or input under the same actor/UUID fails without any mutation. Concurrent identical requests commit once and return the same receipt; a lost response is recoverable by retrying the original UUID and input.

Asset persistence gains an additive nullable revision column. Existing rows read as revision zero. Every persisted asset update, including ordinary web edits and sharing changes, advances the persisted revision monotonically. MCP uses it alongside existing task and record revisions. Read receipts include only public revision values. Atomic guards compare current revisions and affected source row/set state, including authorization state; a stale write cannot overwrite a newer human edit or unsharing.

Operator recovery is a separate internal planner/runbook, not an HTTP or MCP route. It defaults to inspection/dry run, validates the current domain rows still match the operation's after state, refuses changed dependencies, and performs a compensating transaction with new monotonically increasing revisions. It marks the journal restored and retains original evidence. Task compensation re-emits a producer-owned schedule conclusion to the notification outbox so reminders converge to restored state. Recovery of linked maintenance must restore/reconcile the linked schedule, not merely the record. Already delivered reminders and immutable timeline entries remain historical evidence.

## User Stories

- As an operator, I can repair an agent mistake without having retained its chat transcript.
- As a phone user, I can safely retry a timed-out request without creating a duplicate.
- As a teammate, my newer edit is protected when another agent has stale context.

## Acceptance Criteria

### Journal primitive (`S1`)

- [ ] `S1` `OUT-3` `INV-2` New journal storage is additive, private, and contains actor, operation UUID, tool, payload hash, safe receipt, timestamp, and versioned before/after snapshots.
- [ ] `S1` `INV-3` Canonical payload hashes are stable across object key order and differ for null/absence, changed values, array order, and tool names.
- [ ] `S1` `INV-3` A transaction failure leaves no domain mutation, receipt, recovery snapshot, or event outbox row.
- [ ] `S1` `INV-3` Two simultaneous identical actor/UUID requests apply one mutation and yield an equivalent safe receipt.
- [ ] `S1` `INV-1` `INV-3` A UUID reused with different input fails with a conflict; another actor can independently use the same UUID.
- [ ] `S1` `INV-5` Recovery snapshots and raw input are not returned by the journal's public receipt path or recorded in error logs.
- [ ] `S1` `S3` `INV-2` `INV-5` Unknown snapshot versions or malformed/incomplete evidence refuse new commit, successful replay, and recovery apply without changing any domain, outbox, or journal state; only a safe error is returned.

### Mutation integration (`S2`)

- [ ] `S2` `OUT-3` `INV-2` Every permitted MCP write stores complete restoration evidence for every changed domain row, including task advancement/reconciliation caused by a record.
- [ ] `S2` `INV-1` MCP mutation execution invokes existing application use cases and preserves ownership, team access, archive rules, maintenance freeze, and date validation.
- [ ] `S2` `INV-1` `INV-3` Atomic write guards recheck asset/team access, source revisions, and relevant linked-record state; a concurrent change rolls back all writes and receipts.
- [ ] `S2` `INV-3` Asset revisions advance for non-MCP writes too; stale MCP asset edits cannot overwrite a newer web edit or sharing change.
- [ ] `S2` `INV-3` Task/record edits and reschedules require the caller's observed revision. Linked record creation also requires the observed linked-task revision.
- [ ] `S2` `INV-3` No-op edits have a replayable safe receipt, retain accurate evidence, and do not fabricate domain events.
- [ ] `S2` `INV-1` `INV-3` Replay rechecks current parent-resource access and never republishes events or repeats persistence changes.
- [ ] `S2` `INV-5` Partial property edits preserve omitted street data and optional metadata; clearing optional fields is explicit null, never accidental omission.

### Operator recovery (`S3`)

- [ ] `S3` `OUT-3` `INV-2` The operator procedure inspects first and requires an explicit apply step; it is absent from HTTP routes and the MCP tool list.
- [ ] `S3` `OUT-3` `INV-2` Representative create/edit asset, create/edit/reschedule task, and create/correct record operations can be restored using only journal and current persisted state.
- [ ] `S3` `INV-3` Restoration refuses an already restored operation, changed current after state, or new dependent data; it never silently clobbers subsequent work.
- [ ] `S3` `INV-6` Restoring a record or task repairs completion, seed, override, and effective due state with monotonic revisions and a current notification outbox conclusion.
- [ ] `S3` `INV-2` Creation reversal removes only the untouched created entity; dependent asset/task work requires later operations to be reversed first.
- [ ] `S3` `INV-5` Sensitive snapshots appear only in the operator's controlled session; evidence reports use operation IDs and pass/fail rather than raw data.

## Delivery Plan

| Slice | Scope                                                                        | Issue                                                      | Depends on |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| `S1`  | Private journal, canonical hashing, atomic commit/replay primitive           | [#299](https://github.com/snaveevans/pineapple/issues/299) | —          |
| `S2`  | Application use-case integration, revision/access guards, complete snapshots | [#298](https://github.com/snaveevans/pineapple/issues/298) | `S1`       |
| `S3`  | Guarded operator recovery planner, runbook, restoration drills               | [#299](https://github.com/snaveevans/pineapple/issues/299) | `S2`       |

## Evidence Plan

| Authority         | Claim                                     | Layer                              | Named proof                                                                                             | Critical vertical proof? |
| ----------------- | ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `OUT-3` / `INV-2` | Every write can be restored               | SQLite integration/operator drill  | restore all permitted operations from private snapshots                                                 | yes                      |
| `INV-1`           | Access holds at commit/replay             | application and SQLite integration | reject foreign, unshared, and revoked access before commit/replay                                       | yes                      |
| `INV-3`           | Atomic retry and conflict safety          | real SQLite transactions           | concurrent replay, lost response, stale target, linked-record race, and rollback leave one valid result | yes                      |
| `INV-5`           | No private recovery data escapes          | journal/adapter contracts          | receipts and errors contain no street or raw snapshots                                                  | no                       |
| `INV-6`           | Recovery repairs recurrence and reminders | domain/persistence integration     | restore linked maintenance plus override and notification projection                                    | yes                      |

## Edge Cases & Error States

| Scenario                                                  | Expected behavior                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invalid or unauthorized request                           | No journal entry or domain write                                                                                                                 |
| Unknown snapshot version or malformed/incomplete evidence | Refuse mutation, successful replay, and recovery apply; preserve all domain/outbox/journal state and original evidence; return only a safe error |
| Failure between statements                                | Transaction rolls back all domain/journal/outbox state                                                                                           |
| Timeout after commit                                      | Retry returns the committed receipt                                                                                                              |
| Same UUID, changed input                                  | Conflict; original operation remains intact                                                                                                      |
| Newer target edit or unsharing                            | Conflict; refresh current context before a new intended operation                                                                                |
| Replay after access removal                               | Forbidden; no retained snapshot is revealed                                                                                                      |
| Restore after later changes or dependents                 | Refuse; inspect/reverse later operations first                                                                                                   |
| Queue delivery lags                                       | Journal and outbox remain sufficient durable evidence; no reliance on projected timeline                                                         |

## Telemetry

`POST /mcp` remains the normalized `Mcp` request operation. Record only tool name, safe outcome, latency, actor, and operation UUID when necessary; never request bodies, payload hashes, snapshots, street, notes, or receipt content. Existing domain event telemetry runs only for newly committed work and preserves its current selective-reader contracts. Recovery schedule conclusions use the existing notification outbox and are not agent tools.

## Out of Scope

- End-user undo, MCP restore/delete, blind cascade, database-wide rollback, external-message recall
- A general event-sourced rewrite of Pineapple or backfilling recovery evidence for old changes

## Open Questions

None.
