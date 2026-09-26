---
audience: product and engineering
purpose: private mobile conversations can inspect due work and safely manage Pineapple assets and maintenance
source: this file
date: 2026-09-25
---

# ChatGPT Field Operations

**Status:** `review`
**Owner:** Tyler Evans
**Related Intent:** [ChatGPT Field Operations](../../intents/features/chatgpt-field-operations.md) (`accepted`)
**Related Issues:** none yet
**Ready Gate:** `approved 2026-09-25`
**Related Specs:** [Agent Operation Recovery](agent-operation-recovery.md), [ChatGPT Asset Access](chatgpt-asset-access.md), [Authentication](../cross-cutting/authentication.md), [Permissions](../cross-cutting/permissions.md), [Validation](../cross-cutting/validation.md), [Error Handling](../cross-cutting/error-handling.md), [Dashboard](dashboard.md), [Edit Asset](edit-asset.md), [Maintenance Task](maintenance-task.md), [Maintenance Record](maintenance-record.md), [Telemetry](../cross-cutting/telemetry.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0009](../../decisions/0009-computed-fields-belong-in-api-read-models.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

## Summary

Expand Pineapple's authenticated remote MCP with four focused reads and seven bounded writes. The operator can find due work, inspect an asset's schedule/history, create or edit all three asset types, plan recurring work, reschedule, and log/correct completed maintenance from a phone. Every write has a durable recoverable receipt. No delete, archive, sharing, notification-send, or restore tool is available. Existing REST wire contracts remain unchanged.

## Architecture

Retain stateless Streamable HTTP, existing OAuth/Google identity, and application use cases. The composition root injects read dependencies and an application-port mutation executor into the MCP server. Protocol adapters own strict schemas, tool descriptions, scope checks, privacy projection, and safe errors; they do not query D1 or duplicate schedule/access logic. Infrastructure supplies the recovery-backed executor specified in [Agent Operation Recovery](agent-operation-recovery.md).

The tool catalog is bounded. Asset reads require `assets:read`; due/context maintenance reads additionally require `maintenance:read`; asset writes require `assets:write`; maintenance writes require `maintenance:write`. The transport still verifies issuer, audience, expiry, and a base asset-read grant. Tool discovery exposes only tools authorized by the token and the write-enable setting, and each callback independently checks its required scopes. Existing read-only grants continue working without gaining writes. New scopes require renewed explicit consent. Consent explains exactly what can be read/changed, that street details are not returned, and that recovery is operator-run. Deny/revoke/token lifetime behavior remains as in the initial release.

All properties omit the structured `street` field and free-form asset name/nickname from outputs. City, state, postal code, and country are allowed; a safe property label uses locality plus stable ID. Property-context free-form task titles/record titles/notes and displayed ownership strings redact the known stored street and leading house number/street-name literals before either representation is emitted. Sanitization is deterministic, not a claim to detect arbitrary paraphrased addresses. All readable text is generated only from the sanitized structured result. User-provided street is accepted only in create/edit input and not echoed on success, validation, error, telemetry, or replay. Ordinary partial property edits preserve omitted street and optional fields.

Writes use an operation UUID generated once per intended action and reused on timeout/retry. A stable receipt identifies operation, entity, asset, applied revision, replay status, and any linked task's resulting revision/due date. It contains no private snapshots. Edit inputs include the revision from the latest read. Current safe entity readback may be returned separately from the original application receipt; replay never pretends a later state was the original write. An explicit server-side write switch can disable discovery/execution immediately while retaining reads and recovery evidence.

## Tool Contract

MCP declarations are the executable wire authority for these tools; HTTP schemas remain governed by OpenAPI. Every object is strict, including nested objects. IDs and operation IDs are UUIDs; date-only values use existing calendar validation. No actor, owner, sharing, archive, task seed, revision increment, or computed due/status input is accepted.

### Read tools

| Tool                    | Input     | Result and selection                                                                                                                                                                                                                                                           |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_assets`           | none      | All active visible assets, category counts, safe metadata, sharing descriptor, and asset revision. Existing empty/populated behavior remains.                                                                                                                                  |
| `get_asset`             | `assetId` | Authorized asset details and revision; property locality only. Use before editing an asset or resolving ambiguity.                                                                                                                                                             |
| `get_due_maintenance`   | none      | Existing dashboard's server date and urgency-ordered due/soon/overdue rows. Exclude `ok` tasks; distinguish due today with server-derived `daysDue = 0`. Include asset/task IDs, recurrence, completion date, safe labels, sharing, and task revision. No new recommendations. |
| `get_asset_maintenance` | `assetId` | Safe asset context plus all current tasks and reverse-chronological maintenance records, including record/task revisions and task links. Use before scheduling, logging, or correcting work.                                                                                   |

Reads are side-effect-free and annotated read-only, idempotent, non-destructive, and closed-world. There is no silent truncation; these follow the current application collection contracts.

### Write tools

Every write takes `operationId`. Creation fields follow the existing use-case validation. All descriptions require explicit user intent, reuse the same operation UUID on retry, and advise refreshing context after a revision conflict.

| Tool                          | Required input                                            | Optional/patch input                                               | Effect                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_asset`                | `name`, full type-specific `metadata`                     | existing optional type fields                                      | Create a personal asset for the caller; properties require user-supplied street as write input.                                                                                                           |
| `edit_asset`                  | `assetId`, `expectedRevision`                             | `name`, type-specific metadata patch; at least one changed field   | Owner-only. Preserve omitted fields; metadata kind cannot change. Optional VIN/equipment fields/property nickname clear only with null. A partial address patch preserves omitted street/locality fields. |
| `create_maintenance_task`     | `assetId`, `title`, `intervalValue`, `intervalUnit`       | `lastCompletedDate`                                                | Existing time-based creation, seed and next-due rules; no invented initial due-date field.                                                                                                                |
| `edit_maintenance_task`       | `assetId`, `taskId`, `expectedRevision`                   | `title`, `intervalValue`, `intervalUnit`; at least one             | Existing title/interval rules, including override preservation/clearing and schedule calculation.                                                                                                         |
| `reschedule_maintenance_task` | `assetId`, `taskId`, `expectedRevision`, future `nextDue` | none                                                               | Existing future-date override; no maintenance record or claimed completion.                                                                                                                               |
| `record_maintenance`          | `assetId`, `title`, `performedAt`                         | `notes`, `taskId` plus required `expectedTaskRevision` when linked | Existing dated record creation and linked schedule advancement. Explicitly report whether/how the linked task changed.                                                                                    |
| `edit_maintenance_record`     | `assetId`, `recordId`, `expectedRevision`                 | `title`, `performedAt`, `notes` (null clears); at least one        | Existing correction/reconciliation. No relinking or changing creation time/owner.                                                                                                                         |

All writes are non-read-only, closed-world, and idempotent for identical arguments including operation UUID. Create-only asset/task tools use non-destructive annotations. Tools that overwrite existing values, reschedule, or can advance a linked schedule use `destructiveHint: true` under the MCP annotation definition; this accurately prompts host caution and does not authorize deletes or unrecoverable changes. Recovery is enforced by the server, never by this hint. Official annotation sources: [MCP](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/), [OpenAI reference](https://developers.openai.com/plugins/reference).

## User Stories

- As a phone user, I can find my due/soon/overdue work and identify the correct asset/task before acting.
- As an owner, I can create/correct any supported asset without receiving stored property street data.
- As an authorized teammate, I can manage maintenance on shared assets within existing application permissions.
- As a user, I can distinguish completion from rescheduling and trust the returned schedule conclusion.
- As a user, I can safely retry a lost response or refresh after a concurrent edit.

## Acceptance Criteria

### Read context (`S1`)

- [ ] `S1` `OUT-1` `INV-1` Four focused read tools use existing authorized application reads and match owned/team-shared visibility, active-list rules, and asset-scoped archive rules.
- [ ] `S1` `OUT-1` `INV-6` Due rows use dashboard date/status/daysDue/order; only due today, soon, and overdue work is returned, with no inferred recommendation or independent date arithmetic.
- [ ] `S1` `OUT-1` `INV-3` Asset/task/record IDs and current revisions support unambiguous subsequent edits; empty and multi-asset inventories are complete.
- [ ] `S1` `INV-5` Property street, number, name, and nickname are absent from both result representations; permitted locality fields remain available.
- [ ] `S1` `INV-5` Property-context task/record text containing known street literals is redacted; raw original text is never rendered into the readable result.
- [ ] `S1` `INV-4` Read schemas reject identity overrides and unknown inputs, advertise accurate annotations, and cause no domain write/event.

### Grants and bounded writes (`S2`)

- [ ] `S2` `OUT-2` `INV-4` OAuth supports separate asset/maintenance read/write scopes, transparent renewed consent, and compatible existing asset-read grants.
- [ ] `S2` `INV-1` `INV-4` Tool discovery and direct callbacks enforce scopes; read-only or revoked/expired credentials cannot execute writes, even if a client caches a declaration.
- [ ] `S2` `INV-2` The catalog exposes exactly the four reads and seven permitted writes when fully granted/enabled, and never delete/archive/share/unshare/team/send/restore operations.
- [ ] `S2` `OUT-2` `INV-1` All asset types create/edit through application use cases; asset edits are owner-only, type immutable, and omitted metadata is preserved.
- [ ] `S2` `OUT-2` `INV-5` Property creation/street replacement accepts user-provided street input, partial non-street edits preserve it, and success/error/replay output never echoes it.
- [ ] `S2` `OUT-2` `INV-6` Task creation/edit/reschedule follows existing validation, seeds, intervals, overrides, archive/freeze rules, and producer-computed conclusions.
- [ ] `S2` `OUT-2` `INV-6` Maintenance creation/correction follows existing dates, authorization, task linking, advancement/reconciliation, and optional-note clearing.
- [ ] `S2` `OUT-3` `INV-2` Every write uses the recovery journal; deployment never exposes a write lacking complete atomic recovery evidence.
- [ ] `S2` `INV-3` Stable operation IDs, observed revisions, concurrent retries, lost responses, no-ops, and conflicting payloads satisfy the recovery spec and yield safe receipts.
- [ ] `S2` `INV-4` Disabling the write switch removes write discovery and blocks direct execution immediately without breaking reads.
- [ ] `S2` `INV-5` Tool errors use safe stable domain codes/messages; raw exception text, street, snapshots, input bodies, and tokens are absent.
- [ ] `S2` `INV-4` Annotations reflect actual reads/additions/overwrites; recovery never masquerades as an additive operation.

### Release proof (`S3`)

- [ ] `S3` `OUT-1` `OUT-2` Production OAuth discovery, renewed consent, read/write scopes, authenticated MCP initialize/list/call, and readback pass against controlled representative data.
- [ ] `S3` `OUT-3` `INV-2` Operator restoration drills pass for every permitted mutation before writes are enabled in production.
- [ ] `S3` `INV-1` `INV-5` Raw production structured/readable results exclude street and foreign assets, and read-only grants still cannot invoke writes.
- [ ] `S3` `OUT-1` `OUT-2` The owner can select the private connection on mobile and test representative explicit/natural prompts; report any platform limitation without weakening auth/privacy.

## Delivery Plan

| Slice | Scope                                                              | Issue | Depends on                |
| ----- | ------------------------------------------------------------------ | ----- | ------------------------- |
| `S1`  | Focused reads, privacy projections, revisions/context              | —     | recovery revision support |
| `S2`  | Scope/consent/write adapter, recovery-backed executor, kill switch | —     | `S1`, recovery `S1`–`S3`  |
| `S3`  | Production verification and owner mobile acceptance                | —     | `S2`                      |

Read adapters and private recovery infrastructure may be prepared in isolated branches concurrently. Shared contracts land first. Recovery mechanisms, read capability, and write capability have separate PRs; do not combine unrelated web test repairs with feature delivery.

## Evidence Plan

| Authority         | Claim                                    | Layer                           | Named proof                                                                                     | Critical vertical proof? |
| ----------------- | ---------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| `OUT-1`           | Current actionable due queue and context | application/MCP                 | matches dashboard urgency and authorized maintenance context                                    | yes — phone prompt       |
| `OUT-2`           | Every bounded operation works            | application/MCP/production      | creates/edits all asset types, schedules/reschedules, logs/corrects linked maintenance          | yes                      |
| `OUT-3` / `INV-2` | Recovery and catalog boundaries          | real SQLite/operator            | all mutation restoration drills and forbidden tool calls                                        | yes                      |
| `INV-1` / `INV-4` | Least privilege at discovery/call/commit | OAuth/MCP/SQLite                | old read grant, write grant, expired/revoked token, foreign/shared/owner-only targets           | yes                      |
| `INV-3`           | Retry/conflict/partial update safety     | journal/application             | concurrent same-key replay, different-key stale edit, omitted property street, failure rollback | no                       |
| `INV-5`           | Privacy across every output path         | projection/MCP errors/telemetry | street markers absent from raw results, labels, notes, errors, receipts, and logs               | yes                      |
| `INV-6`           | Scheduling stays server-owned            | domain/application              | interval/override, future reschedule, linked create/correction and restoration                  | no                       |

## Edge Cases & Error States

| Scenario                                          | Behavior                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ambiguous property                                | Ask user to choose safe locality/ID; never reveal street to disambiguate     |
| Missing write scope or writes disabled            | No execution; safe authorization/unavailable result                          |
| Unknown delete/share/restore tool                 | Protocol/tool-not-found failure; no mutation                                 |
| Street validation fails                           | Safe field/message only, without input echo                                  |
| Stale revision                                    | Conflict; no side effects; fetch context before retry/new action             |
| Same operation after timeout                      | Reauthorize and return committed receipt; no duplicate                       |
| Archived asset                                    | Existing operation-specific application rules                                |
| Invalid/future performed date or invalid interval | Existing validation error, no receipt/write                                  |
| MCP/server failure                                | Generic safe error; existing state intact or journal permits identical retry |

## Telemetry

`POST /mcp` remains `Mcp`; OAuth remains `Auth` and discovery remains `McpAuthDiscovery`. Normalized tool name/outcome may be recorded without input/result contents. Reads produce no domain events. Newly committed writes use existing AssetCreated/AssetEdited and maintenance Smart Events with existing selective telemetry; replays produce no duplicate event. No body, street, notes, snapshot, token, code, or provider secret is logged.

## Out of Scope

- Delete/archive/sharing/team administration, agent undo/restore, recommendations, new schedule types, autonomous jobs, public publication, custom MCP UI, changing REST wire contracts

## Open Questions

None. Mobile availability remains a release/owner acceptance check, not an implementation assumption.
