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

**Status:** `draft`
**Ready Gate:** `pending`
**Approved By:** `pending`
**Approval Record:** `pending`
**Owner:** Tyler Evans
**Last Updated:** 2026-09-25
**Related Specs:** [ChatGPT Asset Access](../../specs/features/chatgpt-asset-access.md), [Dashboard](../../specs/features/dashboard.md), [Maintenance Task](../../specs/features/maintenance-task.md), [Maintenance Record](../../specs/features/maintenance-record.md), [Permissions](../../specs/cross-cutting/permissions.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0009](../../decisions/0009-computed-fields-belong-in-api-read-models.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

## Problem

The private ChatGPT connection can list assets but cannot help an operator act
on them. On a phone, the operator must switch to Pineapple to find due work,
correct an asset, plan maintenance, or record completed work. Broad access to
write endpoints would expose changes that cannot be reliably repaired.

## Desired Outcomes

- **`OUT-1`** From ChatGPT on a phone, an authenticated Pineapple user can ask
  what maintenance needs attention and receive current, authorized, actionable
  information about their assets, schedules, and recorded work.
- **`OUT-2`** In that conversation, the user can create and edit assets, create
  and edit time-based maintenance tasks, reschedule a task without claiming work
  occurred, and log or correct maintenance records. The agent reports the
  persisted result and any schedule change caused by logging or correcting work.
- **`OUT-3`** Every agent-authorized write can be identified and repaired by a
  Pineapple operator using durable evidence of the affected data and its prior
  state. An in-app undo or self-service recovery flow is outside this intent.

## Affected Users and Systems

This applies to Pineapple users through their private, authenticated ChatGPT
connection and the components that serve it. Existing web and API behavior
continues. The agent follows the same asset and team permissions.

## Invariants

- **`INV-1`** The verified Pineapple identity and existing application use
  cases decide authorization and business rules on every call. A prompt or tool
  argument cannot choose another actor or bypass asset and team permissions.
- **`INV-2`** MCP exposes no hard delete, archive, unshare, or other action that
  removes access, destroys data, or defeats recovery. A write is exposed only
  after its persisted effects, including linked schedule changes, can be
  reconstructed and repaired without relying on the conversation transcript.
- **`INV-3`** Repeated, delayed, or failed tool calls cannot silently create
  duplicate data or overwrite a newer edit. The user can tell whether a change
  was applied.
- **`INV-4`** Read and write permissions are separately consented and
  revocable. Tool declarations accurately identify writes, and Pineapple
  enforces the granted capability server-side rather than trusting client
  confirmations or model instructions.
- **`INV-5`** MCP results and telemetry retain the property-address privacy
  boundary unless explicitly revised. Recovery evidence is access-controlled
  and does not leak private asset data into logs or model output.
- **`INV-6`** A task reschedule never claims maintenance occurred. A maintenance
  record linked to a task follows the existing completion and reconciliation
  rules; the agent does not independently calculate due dates or urgency.

## Constraints

- Use the production remote MCP connection and Pineapple's existing account.
- Reuse application use cases and their read models; do not make MCP a generic
  proxy for the HTTP API.
- Deliver a reliable, operator-run recovery path before enabling each write
  capability in production. A user-facing recovery interface is not required.

## Non-Goals

- Agent-accessible deletion, archiving, sharing changes, or team administration
- One-click undo, self-service restore, or replaying a chat transcript as backup
- Distance- or hour-based schedules, new asset types, autonomous work orders,
  or inferred maintenance recommendations beyond Pineapple's current data
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
  edits, missing or revoked scopes, and a client that tries to invoke a write
  without approval. Verify the server rejects unauthorized access.
- **`INV-3` / `INV-6`** Exercise retries, concurrent edits, task rescheduling,
  and maintenance logging/correction; compare final persisted state and
  server-derived due dates.
- **`INV-5`** Inspect every new read and write result plus telemetry for
  address leakage and sensitive recovery data.

## Proposed Architecture Direction for Ready Gate

Keep a focused MCP adapter over the existing application use cases. Add
purpose-specific read tools for current due work and the asset/task/record
context needed to select a target. Give write tools narrow OAuth capabilities
and accurate annotations. Establish durable, access-controlled recovery
evidence for MCP writes and an operator restoration procedure; a mechanism
shared by write tools should land separately before the first write tool.
Use server-side retry and conflict protection for agent calls.

## Proposed High-Level Delivery Boundaries

First complete the existing authenticated and mobile read-only production
verification. Then deliver useful read context. Establish and drill the
recovery mechanism before adding write tools. Add the bounded asset,
maintenance-task, and maintenance-record writes in separately reviewable
branches, with production mobile and recovery evidence at each release gate.

## Remaining Uncertainty

The existing personal connection's availability on the owner's phone still
needs a live check. Host confirmation behavior may vary; Pineapple must enforce
authorization, input validation, retry safety, and recovery independently.

## Open Questions

1. May property addresses be supplied to or returned from the agent for
   property creation and editing, or should those writes wait while the current
   address-exclusion boundary remains in force?
2. Does "what should be done" mean the existing due/soon/overdue schedule and
   unscheduled assets, or should the agent also propose new maintenance work?
3. Is operator-run restoration of Pineapple's persisted data sufficient even
   though already delivered reminders cannot be unsent? What retention period
   should recovery evidence have?
