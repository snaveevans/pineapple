---
name: chatgpt-asset-access
description: Authenticated Pineapple users can privately query their authorized asset inventory from ChatGPT
metadata:
  type: intent
---

> **Audience:** product owners and affected engineers/agents · **Purpose:**
> authoritative intent for private ChatGPT access to Pineapple assets · **Source
> of truth:** this file · **Last reviewed:** 2026-09-20

# Intent: ChatGPT Asset Access

**Status:** `accepted`
**Ready Gate:** `approved 2026-09-20`
**Approved By:** Tyler Evans
**Approval Record:** Explicit approval in the originating Codex task on 2026-09-20
**Owner:** Tyler Evans
**Last Updated:** 2026-09-20
**Related Specs:** [Asset Library](../../specs/features/asset-library.md), [Authentication](../../specs/cross-cutting/authentication.md), [Permissions](../../specs/cross-cutting/permissions.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

## Problem

Pineapple users cannot securely connect ChatGPT and ask a question such as
"What assets do I have?" from their phone. A workaround would require sharing
credentials, bypassing Pineapple's authorization, or duplicating asset
visibility logic outside the application.

## Desired Outcomes

- **`OUT-1`** A person with a Pineapple account can privately connect Pineapple
  to ChatGPT and authorize read access to their asset inventory.
- **`OUT-2`** In a ChatGPT conversation, the person can explicitly invoke
  Pineapple or ask naturally for their assets and receive the current complete
  set of active assets visible to them.
- **`OUT-3`** The returned information is useful for conversation while
  property addresses remain outside the agent-visible result.

## Affected Users and Systems

This applies to every authenticated Pineapple user and to ChatGPT acting through
the user's authorized MCP connection. Distribution is initially private. Asset
visibility is the Asset Library set: non-archived assets owned by the caller plus
assets currently shared with the caller's team.

## Invariants

- **`INV-1`** Every result is scoped from the authenticated Pineapple identity;
  callers cannot choose another user identity, and the agent never decides
  authorization.
- **`INV-2`** The MCP query preserves Pineapple's existing asset visibility
  rules, including team sharing, and never exposes an asset outside that set.
- **`INV-3`** Property street and house-number data are never returned to the
  MCP client or included in model-readable results. The 2026-09-25 ready-gate
  amendment in [ChatGPT Field Operations](chatgpt-field-operations.md) permits
  other locality fields and user-supplied street details as write input. Property
  names and nicknames remain excluded when they may contain a street address.
- **`INV-4`** The initial integration is strictly read-only and cannot create,
  edit, share, archive, or otherwise mutate Pineapple state.
- **`INV-5`** Access is granted through a revocable, least-privilege user
  authorization flow. Pineapple credentials and access tokens are never placed
  in prompts, tool results, or logs.
- **`INV-6`** Existing web and HTTP API behavior and contracts remain unchanged
  except for additive authentication, consent, routing, and protocol surfaces
  required to support the MCP connection.

## Constraints

- The integration must use a remote, authenticated MCP connection that ChatGPT
  can reach without a developer machine remaining online.
- The connection must use the existing Pineapple account and Google sign-in
  identity rather than API keys or a separate user registry.
- The capability must not intentionally depend on a Pro-only Pineapple design;
  ChatGPT plan and workspace availability remain controlled by OpenAI.
- The first version exposes one purpose-specific asset-listing tool with no
  custom MCP user interface.

## Non-Goals

- Asset creation, editing, sharing, archiving, or any other mutation
- Maintenance status, recommendations, or answering what work is due
- Asset search, individual asset lookup, or pagination
- Daily or weekly reports, scheduled execution, or notifications
- Public plugin publication or third-party distribution
- A custom MCP UI or a general-purpose wrapper around the Pineapple HTTP API
- Returning property street and house-number data to ChatGPT

## Success and Evidence Expectations

- **`OUT-1`** Demonstrate a complete ChatGPT-to-Pineapple connection and consent
  flow using a real Pineapple account, followed by successful token-bound access
  without sharing a cookie, API key, or credential with the conversation.
- **`OUT-2`** Demonstrate on ChatGPT mobile that explicit and natural-language
  requests select the tool and return the same authorized inventory, including
  empty and multi-asset cases.
- **`OUT-3`** Demonstrate useful structured results for each asset type and prove
  that property records retain useful non-address information while every
  address component is absent from both structured and model-readable output.
- **`INV-1` / `INV-2`** Exercise multiple Pineapple identities, owned assets,
  team-shared assets, unshared assets, and foreign assets; prove each caller sees
  exactly the Asset Library visibility set and cannot influence identity through
  tool input.
- **`INV-4`** Show that the advertised tool set contains only the read operation,
  carries accurate read-only/non-destructive annotations, and leaves persisted
  application state unchanged.
- **`INV-5`** Prove invalid and insufficient credentials fail closed,
  authorization can be revoked, and observability captures neither tokens nor
  asset results.
- **`INV-6`** Run the repository's complete verification gate and regression
  evidence for the existing web and API surfaces.

## Approved Architecture Direction

Add a stateless Streamable HTTP MCP adapter at the canonical Pineapple
deployment, alongside the existing API Worker. Extend the
existing Better Auth deployment to act as the OAuth 2.1 authorization server and
protected-resource authority, reusing Google sign-in and issuing a narrow
asset-read grant. Use ChatGPT-compatible dynamic client registration for this
private first version; Client ID Metadata Documents and public publication are
outside this slice.

The MCP adapter resolves the verified token to the Pineapple user and invokes
the existing `ListAssets` use case. Protocol code owns MCP schemas, annotations,
authentication translation, and result projection; it does not query
persistence directly or duplicate visibility rules. The server-side projection
excludes all property address fields. No asset REST endpoint or existing OpenAPI
contract changes.

## High-Level Delivery Boundaries

Deliver this intent in two single-concern branches. First establish the
authenticated MCP transport and its required additive auth storage, discovery,
routing, login/consent behavior, and security evidence. Then add the single
asset-listing tool, its privacy projection, tool-selection evaluations, and
mobile end-to-end evidence. The mechanism branch must land before the feature
branch. Neither branch may add future reporting, maintenance, mutation, search,
or publication capabilities.

## Remaining Uncertainty

OpenAI documents that developer-mode availability can depend on account and
workspace policy but does not establish a durable Plus-versus-Pro guarantee for
private plugins. The integration will be protocol-compatible and avoid
intentional Pro-only behavior, but Pineapple cannot guarantee that OpenAI will
continue exposing private developer-mode connections on every ChatGPT plan.

## Open Questions

None.

## Ready-Gate Amendment — 2026-09-25

Tyler explicitly approved implementation and production delivery of
[ChatGPT Field Operations](chatgpt-field-operations.md). That accepted follow-on
intent governs the expanded tool surface and narrows the sensitive property
field to street and house number. The original all-address exclusion and
single-tool evidence describe the first read-only release; the expansion spec
owns the amended contract and evidence.
