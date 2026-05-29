# Documentation method

- Status: accepted
- Date: 2026-05-29

## Context and Problem Statement

The project had good Architecture Decision Records (the _why_) but nothing
describing the _what_ and _how_: no API reference, no data-model description, no
product/feature overview, and no front door for either humans or the AI agents
that increasingly read and modify this repo.

The documentation needs to serve several audiences at once — a UI developer who
needs the API contract, a designer who needs to know what data exists, a product
manager and marketing who need to know what the product does — without each
fact being copied into multiple places where copies rot. It must be equally
useful to an LLM, which means machine-readable where possible and discoverable
from a single entry point.

## Decision Drivers

- Documentation must not drift from the code — stale docs are worse than none
- One fact should have exactly one home; everything else links to it
- Must serve multiple audiences (dev, designer, PM, marketing) and LLMs
- An LLM should be able to orient itself and find anything from one entry point
- Low maintenance burden for a two-person team

## Considered Options

- **Layered docs with a generated API spec** — a small set of doc types
  organized by purpose, with the API reference generated from the Zod schemas
  and committed as a static artifact, fronted by `README.md` (humans) and
  `CLAUDE.md` (agents)
- **Hand-written Markdown for everything**, including the API reference
- **External docs site / wiki** (e.g. a hosted docs platform)

## Decision Outcome

Chosen option: **Layered docs with a generated API spec**, because it is the
only option that defends against drift on the highest-churn surface (the API)
while keeping everything in-repo and discoverable. Docs live under `docs/`
organized by purpose (`reference/`, `product/`, `guides/`, `decisions/`), with
`README.md` and `CLAUDE.md` as the two front doors. The OpenAPI spec is
generated from the Zod route specs, served at `/openapi.json` (+ a Scalar UI at
`/reference`), and committed to `docs/reference/openapi.json` with a CI check
that fails if it is stale. The method itself is documented in
[`docs/README.md`](../README.md).

### Positive Consequences

- The API contract cannot silently drift: the schemas are the single source for
  validation _and_ documentation, and CI enforces the committed copy
- The committed `openapi.json` is readable by codebase-aware tools (e.g. Claude
  design) without running anything, while the same spec is reachable by URL
- Clear per-audience entry points; one hub (`CLAUDE.md`) for agents
- Everything stays in version control, reviewed alongside code

### Negative Consequences

- Hand-written docs (data model, product, guides) still require discipline to
  keep current; the per-doc "Last reviewed" header is the only guard
- Generating the spec adds a build dependency (`@hono/zod-openapi`, `tsx`) and a
  CI step
- Route handlers and route specs are split (specs in `api/`, handlers in
  `worker.ts`) to satisfy layer boundaries — a minor indirection
