---
audience: product and engineering
purpose: privately expose each Pineapple user's authorized active assets to ChatGPT through MCP
source: this file
date: 2026-09-20
---

# ChatGPT Asset Access

**Status:** `in-progress`
**Owner:** Tyler Evans
**Related Intent:** [ChatGPT Asset Access](../../intents/features/chatgpt-asset-access.md) (`accepted`)
**Related Issues:** none
**Ready Gate:** `approved 2026-09-20`
**Related Specs:** [Authentication](../cross-cutting/authentication.md), [Permissions](../cross-cutting/permissions.md), [Error Handling](../cross-cutting/error-handling.md), [Telemetry](../cross-cutting/telemetry.md), [Testing](../cross-cutting/testing.md), [Schema Migrations](../cross-cutting/schema-migrations.md), [Sign In](./sign-in.md), [Asset Library](./asset-library.md)
**Related ADRs:** [ADR-0003](../../decisions/0003-monorepo-layer-architecture-and-dependency-rules.md), [ADR-0007](../../decisions/0007-zod-openapi-validation.md), [ADR-0017](../../decisions/0017-expand-contract-schema-migrations.md), [ADR-0019](../../decisions/0019-use-intent-driven-development.md)

---

## Summary

An authenticated Pineapple user can privately connect Pineapple to ChatGPT and
ask for the active assets they can see. The first version exposes one read-only
MCP tool, returns the same owned and team-shared inventory as the Asset Library,
and removes property addresses before any result reaches ChatGPT.

## Architecture

The existing API Worker serves a stateless Streamable HTTP MCP endpoint at
`POST /mcp`. MCP protocol initialization, tool discovery, and tool calls all use
that endpoint; legacy HTTP+SSE transport is rejected. Pineapple's existing
Better Auth instance also acts as the OAuth 2.1 authorization server and MCP
protected-resource authority. Its endpoints remain under `/api/auth/*`, with
standards-based authorization-server and protected-resource metadata exposed at
the locations required by MCP clients. The private first release permits
dynamic client registration because ChatGPT supports it; Client ID Metadata
Documents and public plugin publication are not part of this feature.

OAuth uses authorization code with PKCE and the existing Google sign-in. The
grant is revocable and requests the narrow `assets:read` scope. A dedicated web
consent route identifies Pineapple and the requesting client, states that the
connection can read active owned and team-shared assets, and lets the user allow
or deny access. The signed OAuth continuation value is treated as opaque and is
preserved through sign-in and consent. Before consent is granted, the existing
profile path ensures the Better Auth identity has its corresponding Pineapple
domain user. Access tokens are accepted only for Pineapple's MCP resource and
the required scope.

The MCP adapter resolves the verified token subject to the corresponding domain
user and invokes the existing `ListAssets` use case. It never accepts a user ID
as tool input and never queries D1 repositories directly. `ListAssets` remains
the single authority for active, owned, and team-shared visibility.

The tool is named `list_assets`, takes no arguments, and is described so both an
explicit Pineapple request and a natural request for the caller's asset
inventory select it. It advertises accurate read-only, non-destructive,
idempotent, and closed-world annotations. Its structured result contains the
Asset Library category counts and, for every visible asset, the existing
API-visible fields: ID, type, sanitized metadata, archive value, created and
updated timestamps, and sharing descriptor, plus the name for non-property
assets. Vehicle and equipment metadata are returned unchanged. A property's
free-form name is omitted because Pineapple commonly uses its street address
as that name. Property metadata contains only `kind`; the optional free-form
nickname is also omitted because it can contain an address. Human/model readable
content is rendered exclusively from that already-sanitized structured result
so an address cannot leak through a second representation.

This capability does not alter the OpenAPI contract. OAuth schema additions are
additive D1 tables introduced in one forward-only migration before code that
uses them. Production routing gives the API Worker ownership of `/mcp` and the
required discovery paths while leaving all existing API and SPA routes intact.

## User Stories

- As a **Pineapple user**, I can **connect my Pineapple account privately to ChatGPT** so that **ChatGPT can act with my approved read-only access**.
- As a **Pineapple user**, I can **explicitly invoke Pineapple or naturally ask what assets I have** so that **I receive my current authorized inventory on my phone**.
- As a **Pineapple user**, I can **see useful details for each returned asset without exposing property addresses** so that **I can discuss my inventory safely**.

## Acceptance Criteria

- [x] `S1` `OUT-1` `INV-5` Pineapple publishes OAuth authorization-server and MCP protected-resource metadata that identifies the canonical `/mcp` resource and supports authorization code with PKCE.
- [x] `S1` `OUT-1` `INV-5` A private ChatGPT client can dynamically register, send the user through existing Google sign-in when needed, and obtain tokens only after an explicit allow decision on Pineapple's consent screen.
- [x] `S1` `OUT-1` `INV-5` The consent screen supports allow and deny, validates the signed OAuth continuation with the provider before rendering an actionable grant, preserves it through authentication, and ensures the authenticated identity has a corresponding Pineapple domain user before an allow decision completes. Client names supplied through dynamic registration are identified as self-reported, never invented by Pineapple.
- [x] `S1` `INV-1` `INV-5` `POST /mcp` fails closed for missing, malformed, expired, wrong-issuer, wrong-audience, or insufficient-scope bearer tokens and never accepts a cookie session as MCP authorization.
- [x] `S1` `INV-5` A user can revoke the Pineapple grant through the authorization provider; revocation blocks refresh and future grants immediately, and an already-issued self-contained access token expires within five minutes.
- [x] `S1` `INV-6` The OAuth/MCP auth schema is introduced only through additive tables and indexes, and existing sign-in, session, API, SPA, OpenAPI, docs, and health behavior remains unchanged.
- [x] `S2` `OUT-2` The MCP server advertises exactly one application tool named `list_assets`; it has no input fields and its name, title, and description support both explicit Pineapple invocation and natural asset-inventory requests.
- [x] `S2` `INV-4` The `list_assets` declaration marks the operation read-only, non-destructive, idempotent, and closed-world, and no mutating Pineapple tool is exposed.
- [x] `S2` `INV-1` A successful tool call derives its Pineapple user only from the verified token subject; no prompt or tool argument can select or override the caller identity.
- [x] `S2` `OUT-2` `INV-2` The tool invokes `ListAssets` and returns exactly the caller's active owned and team-shared assets, excluding archived, unshared, and foreign assets, with correct category counts for empty and populated inventories.
- [x] `S2` `OUT-3` The structured result includes each visible asset's API-visible ID, type, timestamps, archive value, sharing descriptor, and type-specific metadata; non-property assets also include their name, including vehicle VIN and equipment serial number when present.
- [x] `S2` `OUT-3` `INV-3` Property results include `kind` but omit the free-form asset name and nickname, `address` object, and every street, city, state, postal-code, and country value from structured and model-readable content.
- [x] `S2` `INV-4` A `list_assets` call performs no domain or persistence mutation and publishes no domain event.
- [x] `S2` `INV-5` Request telemetry records the normalized MCP operation, outcome, latency, and authenticated Pineapple user ID without recording bearer tokens, OAuth codes, tool arguments, asset names, metadata, or tool results.
- [ ] `S2` `OUT-2` Explicit invocation and representative direct, indirect, and out-of-scope prompts produce the intended tool-selection behavior in ChatGPT, with out-of-scope requests neither inventing capabilities nor selecting a mutation.

## Delivery Plan

| Slice | Scope                                                                                                                                                                                         | Issue | Depends on |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| `S1`  | Stateless MCP transport, OAuth provider/protected-resource support, additive auth storage, production and local routing, login continuation, consent UI, and authentication/security evidence | —     | —          |
| `S2`  | `list_assets` adapter, privacy-safe result projection, authorization/visibility tests, selection evaluations, and ChatGPT mobile evidence                                                     | —     | `S1`       |

The mechanism slice lands before the asset-tool slice. Each slice is a separate
branch and pull request; the second may be prepared as a stacked change but is
not mergeable until the first has landed.

## Evidence Plan

| Authority | Claim                                                                 | Layer                               | Named proof                                                                                                                                                                        | Critical vertical proof?                             |
| --------- | --------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `OUT-1`   | A Pineapple account can connect and grant private access              | browser/API integration             | `connects a ChatGPT OAuth client through Google sign-in and consent`                                                                                                               | yes — private ChatGPT connection                     |
| `OUT-2`   | Explicit and natural requests return the current authorized inventory | MCP contract/evaluation             | `lists the caller's assets for explicit and natural inventory prompts`                                                                                                             | yes — ChatGPT mobile asset query                     |
| `OUT-3`   | Results are useful while property addresses remain private            | adapter contract                    | `returns complete type details while removing every property address field`                                                                                                        | yes — one asset of each type                         |
| `INV-1`   | Identity comes only from the verified token                           | infrastructure/API integration      | `rejects identity override and resolves the token subject to its domain user`                                                                                                      | no                                                   |
| `INV-2`   | MCP preserves Asset Library visibility                                | application/adapter integration     | `matches ListAssets for owned shared archived unshared and foreign assets`                                                                                                         | no                                                   |
| `INV-3`   | Addresses never reach either MCP result representation                | adapter contract                    | `omits property address from structured and readable tool content`                                                                                                                 | no                                                   |
| `INV-4`   | The MCP surface is strictly read-only                                 | MCP contract/state comparison       | `advertises only the annotated read tool and leaves persistence unchanged`                                                                                                         | no                                                   |
| `INV-5`   | Authorization is least-privilege, revocable, and secret-safe          | auth integration/telemetry contract | `fails closed outside the assets read grant and refuses refresh after revocation`; `expires issued access within five minutes`; `keeps OAuth secrets and results out of telemetry` | yes — revoke then retry after the access-token bound |
| `INV-6`   | Existing behavior is unaffected                                       | repository regression               | `pnpm verify`; generated-artifact drift checks; existing auth/API/web route suites                                                                                                 | no                                                   |

## Edge Cases & Error States

| Scenario                                                                                      | Expected Behavior                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No bearer token or a cookie-only session calls `/mcp`                                         | OAuth challenge; no tool execution or asset data                                                |
| Bearer token is expired, malformed, issued elsewhere, or for another resource                 | OAuth-compatible authorization failure; no fallback to a browser session                        |
| Grant is revoked while a self-contained access token is still valid                           | Refresh and future grants fail immediately; the issued access token expires within five minutes |
| Token lacks `assets:read`                                                                     | Insufficient-scope challenge; no tool execution                                                 |
| Token subject has no Better Auth identity or no provisioned domain user                       | Fail closed without revealing whether another user or asset exists                              |
| User denies consent                                                                           | Return to the client with the standard OAuth denial; issue no grant                             |
| User cancels or Google sign-in fails                                                          | Preserve a retryable error state without silently approving consent                             |
| Inventory is empty                                                                            | Successful result with an empty asset array and zero category counts                            |
| Inventory mixes owned and team-shared assets                                                  | Return both with the existing sharing descriptors and correct counts                            |
| Visible property's free-form name, nickname, or structured address contain its street address | Omit the property name, nickname, and address fields; return safe non-address fields only       |
| `ListAssets` fails unexpectedly                                                               | Return a generic MCP tool error; log the operational error without result data                  |
| MCP client attempts legacy transport or an unsupported method                                 | Reject it without creating server-side session state                                            |

## Telemetry

**Request telemetry:** `POST /mcp` maps to the `Mcp` operation and the normalized
`/mcp` route via `createTechnicalTelemetryMiddleware`. OAuth endpoints continue
to map to `Auth`; MCP discovery requests map to `McpAuthDiscovery` and their
normalized well-known route. The existing request envelope records status,
latency, authenticated state, and domain user ID. It never records request or
response bodies, bearer tokens, authorization codes, asset content, or tool
results. These operation mappings are added to
[telemetry.md](../cross-cutting/telemetry.md).

**Domain events:** None — MCP transport and asset listing are read operations.
Domain-user provisioning remains part of the existing authenticated sign-in/profile
flow and retains its existing `UserProvisioned` behavior.

## Out of Scope

- Asset creation, editing, sharing, archiving, lookup, search, or pagination
- Maintenance status, work recommendations, or any other Pineapple domain query
- Daily or weekly reports, scheduled execution, or notifications
- Public plugin publication, third-party distribution, or Client ID Metadata Documents
- A custom MCP application UI, resources, prompts, or a general-purpose API wrapper
- Property addresses in any ChatGPT-visible representation
- Any existing REST/OpenAPI response change
- A guarantee that OpenAI will expose private developer-mode connections on every ChatGPT plan

## Flags

**PLATFORM SURFACE UNCERTAINTY — ChatGPT mobile:** OpenAI's current
[developer-mode guidance](https://developers.openai.com/api/docs/guides/developer-mode)
lists Plus and Pro on the web, while its [plugin guidance](https://learn.chatgpt.com/docs/plugins)
says plugins available to an account can be used on mobile. The accepted
mobile evidence remains required to prove that this specific personal MCP
connection is available on the owner's phone.

## Open Questions

None.
