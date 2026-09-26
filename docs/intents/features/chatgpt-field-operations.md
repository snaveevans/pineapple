---
name: chatgpt-field-operations
description: Safely manage Pineapple assets and maintenance through a private ChatGPT conversation
metadata:
  type: intent
---

> **Audience:** product owner and affected engineers/agents · **Purpose:**
> proposed intent for conversational field operations through Pineapple's MCP ·
> **Source of truth:** this draft · **Last reviewed:** 2026-09-25

# Intent: ChatGPT Field Operations

**Status:** `accepted`
**Ready Gate:** `approved 2026-09-25`
**Approved By:** Tyler Evans
**Approval Record:** Explicit authorization in the originating Codex task to specify, implement, test with delegated agents, and deploy to production on 2026-09-25
**Owner:** Tyler Evans
**Last Updated:** 2026-09-25
**Related Specs:** [ChatGPT Asset Access](../../specs/features/chatgpt-asset-access.md), [Create Asset](../../specs/features/create-asset.md), [Edit Asset](../../specs/features/edit-asset.md), [Dashboard](../../specs/features/dashboard.md), [Maintenance Task](../../specs/features/maintenance-task.md), [Maintenance Record](../../specs/features/maintenance-record.md), [Permissions](../../specs/cross-cutting/permissions.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0009](../../decisions/0009-computed-fields-belong-in-api-read-models.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

## Problem

The private ChatGPT connection only lists assets. Phone users must switch to
Pineapple to find due work or change assets and maintenance. Broad write access
would expose changes that cannot be reliably repaired.

## Desired Outcomes

- **`OUT-1`** From ChatGPT on a phone, an authenticated Pineapple user can ask
  what is due today, due soon, or overdue and receive current, authorized
  information from Pineapple's existing schedules and recorded work.
- **`OUT-2`** In that conversation, the user can create and edit vehicle,
  property, and equipment assets; create and edit time-based maintenance tasks;
  reschedule a task without claiming work occurred; and log or correct
  maintenance records. The agent reports the persisted result and any linked
  schedule change.
- **`OUT-3`** An operator can identify and repair every agent-authorized write
  from durable evidence of affected data and prior state. No in-app undo is
  required.

## Affected Users and Systems

This applies to Pineapple users through their private ChatGPT connection. The
agent follows existing asset and team permissions. Property selection and edits
must work without returning the stored street and house number.

## Invariants

- **`INV-1`** The verified Pineapple identity and existing application use
  cases decide authorization and business rules on every call. A prompt or tool
  argument cannot choose another actor or bypass asset and team permissions.
- **`INV-2`** MCP exposes no hard delete, archive, unshare, or other action that
  removes access or destroys data. Every write and linked schedule change must
  be repairable without relying on the conversation transcript.
- **`INV-3`** Repeated, delayed, or failed tool calls cannot silently create
  duplicate data or overwrite a newer edit. The user can tell whether a change
  was applied.
- **`INV-4`** Read and write permissions are separately consented and
  revocable. Pineapple labels writes accurately and enforces grants server-side.
- **`INV-5`** A property's street and house number are sensitive. MCP reads,
  write results, and telemetry never expose them. Other locality fields may be
  returned. A property edit that does not change the street preserves its stored
  value without returning it. Property names and nicknames must not become a
  back door for returning the street. User-supplied street details may be accepted
  as write input; this means the user has supplied them to ChatGPT. Recovery
  evidence is operator-only.
- **`INV-6`** A task reschedule never claims maintenance occurred. A maintenance
  record linked to a task follows the existing completion and reconciliation
  rules; the agent does not independently calculate due dates or urgency.

## Constraints

- Use the production remote MCP connection and Pineapple's existing account.
- Reuse application use cases and their read models; do not make MCP a generic
  proxy for the HTTP API.
- Deliver a reliable, operator-run recovery path before enabling each write
  capability in production. A user-facing recovery interface is not required.
- Retain operator-only recovery evidence for the account's lifetime and remove
  it with the account.
- Restoration covers Pineapple's persisted data; delivered reminders cannot be
  unsent.

## Non-Goals

- Agent-accessible deletion, archiving, sharing changes, or team administration
- One-click undo, self-service restore, or replaying a chat transcript as backup
- Distance- or hour-based schedules, new asset types, autonomous work orders,
  or inferred maintenance recommendations beyond the existing due queue
- Scheduled agent runs, unsolicited messages, public plugin publication, or
  general-purpose access to Pineapple's database or REST API

## Success and Evidence Expectations

- **`OUT-1` / `OUT-2`** Complete real ChatGPT mobile conversations against
  representative production assets. Compare raw tool results, conversation,
  Pineapple web state, and readback after each action.
- **`OUT-3` / `INV-2`** For every exposed write type, demonstrate an operator
  restoring representative test data from the durable recovery evidence,
  including a linked record that changed a task's schedule. Prove the evidence
  survives a failed client response and does not depend on chat history.
- **`INV-1` / `INV-4`** Exercise two identities, team-shared assets, owner-only
  edits, missing or revoked write grants, and unauthorized calls.
- **`INV-3` / `INV-6`** Exercise retries, concurrent edits, task rescheduling,
  and maintenance logging/correction; compare final persisted state and
  server-derived due dates.
- **`INV-5`** Inspect property reads, write results, free-form labels, and
  telemetry for street and house-number leakage; prove other locality fields
  remain useful.

## Approved Architecture Direction

Keep a focused MCP adapter over the existing application use cases. Add
purpose-specific read tools for the existing due queue and the asset/task/record
context needed to select a target. Give write tools narrow OAuth capabilities
and accurate annotations. Build on the existing transactional activity outbox
where possible, adding access-controlled prior-state evidence and an operator
restoration procedure for every exposed write. Land shared recovery work before
the first write tool. Use server-side retry and conflict protection. The new
property boundary revises the [ChatGPT Asset Access](chatgpt-asset-access.md)
address invariant through this approved ready gate.

## High-Level Delivery Boundaries

Complete mobile read-only verification, then deliver read context. Drill
recovery before adding bounded asset, task, and record writes in separate
branches. Each release needs mobile and recovery evidence.

## Remaining Uncertainty

The existing personal connection still needs a live phone check. Host
confirmation behavior may vary; Pineapple enforces its own safety rules. The
activity timeline lacks sufficient prior state for some proposed writes.

## Open Questions

None. The authorization to implement property creation includes accepting
user-supplied street details as write input; stored street details remain absent
from MCP reads and write results.
