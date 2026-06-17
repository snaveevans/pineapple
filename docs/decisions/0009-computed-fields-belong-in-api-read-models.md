# Computed Fields Belong in API Read Models

- Status: accepted
- Date: 2026-06-16

## Context and Problem Statement

As the app grows beyond the dashboard, derived values like task status (`overdue`, `soon`, `ok`),
status counts, and filter category labels appear in multiple places. The question is where this
derivation happens: in the API before the response is sent, or in the client after it receives
raw data.

If the client derives these values, each client surface (dashboard, asset detail, task list)
duplicates the same logic. Any future client — a mobile app, a notification worker, a webhook
— has to reimplement it. A change to the "soon" window (e.g. from 7 days to 14 days) must be
found and updated in every place it was computed.

## Decision Drivers

- Business logic — what "overdue" means, how many items fall into each status bucket — belongs
  in the domain, not in rendering code
- The OpenAPI contract is the single source of truth for the API (ADR-0008); having clients
  silently derive fields outside that contract undermines it
- Future clients (mobile, background workers) should consume the same pre-computed values
  without re-implementing derivation logic
- Client code should be a thin rendering layer: it decides _how_ to display a value, not _what_
  the value is

## Considered Options

- **API computes derived fields, client renders them** — the API response includes status
  labels, counts, and status filter metadata; the client reads and displays them
- **Client computes derived fields from raw API data** — the API returns raw date strings and
  scalar values; each client computes labels, thresholds, and counts locally
- **Hybrid: client computes from a shared utility package** — derivation logic lives in a
  shared package consumed by both the API and the client

## Decision Outcome

Chosen option: **API computes derived fields, client renders them**, because it keeps business
logic in the layer that owns it and gives all consumers a consistent, authoritative result
without duplication.

### Positive Consequences

- Threshold and label changes are made in one place (domain/application layer) and propagate
  to all consumers automatically
- Client code is simpler — no calendar arithmetic, no branching on raw values; it maps a status
  string to a colour or icon
- API responses are self-describing; the OpenAPI spec documents the computed fields alongside
  the raw data
- Unit tests for derived logic live in the API's test suite, not scattered across frontend tests

### Negative Consequences

- Read models may carry more fields than the simplest possible response; the API must be
  designed to include the fields a client needs rather than deferring to the client to compute them
- If a client needs a derived value the API doesn't yet provide, the API must be updated first —
  the client cannot unilaterally work around it

---

## Boundary: what the API owns vs. what the client owns

| Concern                                                     | Owner  | Examples                                                                                                                                       |
| ----------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Status bucket derived from `nextDue`                        | API    | `"overdue"` / `"soon"` / `"ok"` via calendar-day comparison against `todayUtc`                                                                 |
| Counts per status bucket                                    | API    | `{ overdue: 3, soon: 1, ok: 12 }`                                                                                                              |
| Status filter metadata (value, label, count)                | API    | `[{ value: "overdue", label: "Overdue", count: 3 }, …]`                                                                                        |
| Threshold definition (e.g. "soon" = within 7 calendar days) | API    | Defined in domain; reflected in OpenAPI descriptions as needed                                                                                 |
| Asset category filters (vehicle / equipment / property)     | Split  | Aggregate read models (e.g. dashboard) include per-category counts; client owns which category is active and filters the returned list locally |
| Which status filter is currently active                     | Client | `useState`, URL search params — ephemeral UI state                                                                                             |
| Relative due-date copy ("Overdue · 3 days", "In 5 days")    | Client | Formatted from API `nextDue` + `todayUtc`; client must not re-derive the status bucket                                                         |
| How to visually render a status (`"overdue"` → red badge)   | Client | Tailwind class, icon, colour token — pure presentation                                                                                         |

**Asset category filters** are a distinct case from status filters. Aggregate read model endpoints
(such as `GET /api/dashboard`) include pre-computed per-category counts (e.g. vehicle: 3,
equipment: 2, property: 1) as part of their fleet summary; the client uses those counts to render
filter pill badges. The full item list is returned in a single response, and the client filters it
locally by category. The API does not track or return which category pill is currently selected.

## Delivery patterns

Computed fields can ship via **enriched resource responses** (e.g. a `status` field on each task
in `GET /api/assets/{assetId}/maintenance-tasks`) or via **dedicated read models** (e.g.
`GET /api/dashboard` that aggregates counts across assets) — the choice depends on what shape
the consumer needs, but the same domain derivation logic is used in both cases.

## Pattern

```ts
// application layer — derivation uses date-only calendar arithmetic, not timestamp subtraction
function deriveTaskStatus(nextDue: string, todayUtc: string): "overdue" | "soon" | "ok" {
  if (nextDue < todayUtc) return "overdue";
  const sevenDaysOut = addCalendarDays(todayUtc, 7); // calendar-day addition, not milliseconds
  if (nextDue <= sevenDaysOut) return "soon";
  return "ok";
}

// API read model — computed field is part of the response shape
type TaskSummary = {
  id: TaskId;
  title: string;
  nextDue: string; // YYYY-MM-DD; retained so the client can format display copy
  status: "overdue" | "soon" | "ok"; // derived by the API; client does not re-derive
};
```

The client receives `status` and maps it to UI: a colour, an icon, a label string. It may
format relative copy such as "Overdue · 3 days" or "In 5 days" from `nextDue` and today's
date — but it must not inspect `nextDue` to decide _which bucket_ a task falls into.

---

## Pros and Cons of the Options

### API computes derived fields, client renders them _(chosen)_

- ✅ Good, because threshold changes propagate from one place to all consumers
- ✅ Good, because the client has no calendar arithmetic — it maps a known enum to presentation
- ✅ Good, because computed fields appear in the OpenAPI spec and are therefore contractual
- ❌ Bad, because the API must anticipate which derived values a client will need

### Client computes derived fields from raw API data

- ✅ Good, because the API can return minimal payloads — no server-side pre-computation
- ❌ Bad, because every client surface duplicates the same derivation logic
- ❌ Bad, because threshold changes must be hunted down across all client code
- ❌ Bad, because future clients (mobile, notifications) inherit the same duplication problem

### Hybrid: client computes from a shared utility package

- ✅ Good, because derivation logic is defined once and imported rather than duplicated
- ❌ Bad, because `packages/shared/` is the innermost layer (ADR-0003) and must not contain
  application-level concepts like status thresholds — importing them into the web client would
  make `shared/` a de-facto application layer dependency for the frontend
- ❌ Bad, because any consumer of the package still runs derivation at the edge; a backend
  change requires re-deploying every client simultaneously to stay consistent
- ❌ Bad, because the discipline required to keep the shared package from accumulating business
  logic is high; it tends to become a catch-all over time
