> **Audience:** Pineapple operators and integration testers · **Purpose:** connect, verify, and operate the expanded private MCP · **Source of truth:** [Field Operations specification](../specs/features/chatgpt-field-operations.md) and [Recovery specification](../specs/features/agent-operation-recovery.md) · **Last reviewed:** 2026-09-26

# Private MCP field operations

The personal connection uses `https://pineapple.txe.app/mcp`. Its permitted
catalog is defined in the [feature specification](../specs/features/chatgpt-field-operations.md#tool-contract).
It supports authorized asset and maintenance reads, asset creation/editing,
schedule creation/editing/rescheduling, and maintenance recording/correction.
It has no deletion, archiving, sharing, sending, or recovery tool.

The transport uses the SDK's current stateless MCP protocol and
`server/discover`; it rejects legacy `initialize` requests. Use a host that
supports the deployed protocol rather than treating a legacy initialization
error as an authorization failure.

Property street and house number are private. The MCP accepts a street supplied
by the user when creating a property or replacing its street, but never returns
the stored street. Property names/nicknames are omitted because those free-form
fields can contain addresses. City, state, postal code, country, and stable IDs
help identify properties. Known street literals in property-context text and
repeated locality fields are redacted; this is deterministic sanitization, not
general address detection.

## Connection renewal

An existing asset-read connection remains compatible and does not silently gain
permissions. Refresh the connection's tool metadata after this release. To use
maintenance reads or writes, renew authorization through the connection's OAuth
flow and inspect the requested permissions on Pineapple's consent page. If the
host retains the original narrow request, create a new personal connection to
the same endpoint using the host's current connection controls.

Confirm the consent page names the client you just connected, explains the
requested read/write permissions, excludes street from responses, and describes
operator recovery. Never paste a Pineapple session cookie, bearer token, or
client secret into a prompt. Keep the connection personal and unpublished.

OpenAI's [connection documentation](https://developers.openai.com/plugins/deploy/connect-chatgpt)
describes refreshing tool metadata and testing a connection in ChatGPT.
Its [plugin availability documentation](https://learn.chatgpt.com/docs/plugins)
describes using account-available plugins on mobile. The owner's actual phone
test remains necessary; account/platform availability is not proven by a server
deployment.

## Phone acceptance prompts

Start a new chat with the refreshed personal Pineapple connection enabled.
Use representative test assets and compare the results with the Pineapple app.

1. “What maintenance is due today, coming soon, or overdue?”
2. “Show the schedules and maintenance history for this asset.”
3. “Create a test equipment asset named MCP phone test.” Supply the required
   type details when the agent asks.
4. “Change its name to MCP phone test edited.”
5. “Schedule a monthly inspection for it.”
6. “Change that schedule to every two months.”
7. “Move its next due date to [a future date].”
8. “Record that I completed the inspection today and link it to that schedule.”
9. “Correct that maintenance record's notes to Phone acceptance complete.”

For property creation, supply the street yourself. A later locality-only edit
must preserve the stored street without returning it. Confirm both tool result
representations omit the street; an agent's friendly summary alone is not proof.
Ask to delete/archive an asset or restore an operation: no such tool should be
available. A read-only connection must have no write capability.

An agent should read current context before editing, use the returned revision,
and reuse one operation UUID after a timeout. After a conflict, refresh context
before deciding on a new action. A replay returns the original application
receipt; current state is obtained with a separate read.

## Recovery and activity

Every committed MCP mutation has a protected, durable before/after journal and
safe operation receipt. Preserve the operation UUID if an operator must reverse
it. Recovery is an operator action described in the
[recovery runbook](../runbooks/agent-operation-recovery.md); there is no end-user
undo flow. Recovery refuses stale or incomplete evidence and requires dependent
operations to be reversed first. Revisions advance during compensation.

Activity history records what happened and is not erased by recovery. Already
delivered reminders are historical facts. Future reminder state converges to
the restored schedule even if earlier events arrive late.

## Release gates and rollback

Deploy composition with `MCP_WRITES_ENABLED` set to the string `false` first.
Complete author-external review, full `pnpm verify`, all seven local
executor/journal/operator restoration drills, and migration/deployment checks
before enabling writes in a separately reviewed configuration change. Only the
literal string `true` enables them. The switch affects discovery and execution;
it preserves reads and existing recovery evidence.

Record actual deployed API/web version IDs, all three new D1 migration names,
authenticated protocol/scope/privacy/readback checks, controlled production
restore results, and phone acceptance status. Never put tokens, raw snapshots,
or real streets in release records. `/health` reports only the latest migration;
inspect migration history to confirm the journal, asset-revision, and OAuth
client-capability migrations applied.

If a write defect is found, disable writes and preserve the journal. If access
or privacy fails, follow the [rollback runbook](../runbooks/rollback.md) and use a
recorded safe Worker version. Worker rollback does not restore business data or
undo additive D1 migrations. Restore specific operations through the operator
procedure. Do not drop journal tables or replace the whole database as a code
rollback.

OAuth revocation blocks refresh and subsequent authorization. Existing
self-contained access tokens expire within the configured five-minute bound;
disconnecting a host connection alone is not a server-wide write switch.

The [initial read-only release record](mcp.md) is retained as historical evidence
and a source of pre-expansion rollback version IDs.
