# Documentation

How Pineapple documents itself, and where each kind of knowledge lives. The
guiding rule:

> **Each fact has one home; everything else links to it.** Where a fact can be
> derived from code, the docs are _generated_ from code so they cannot drift.

This keeps documentation trustworthy for both humans and the AI agents that read
this repo.

## The doc types

| Type            | Lives in                                 | Source of truth                 | Primarily serves           |
| --------------- | ---------------------------------------- | ------------------------------- | -------------------------- |
| Front door      | `README.md`, `CLAUDE.md`                 | hand-written                    | newcomers · AI agents      |
| Decisions (ADR) | `docs/decisions/`                        | hand-written                    | engineers (the _why_)      |
| Specs           | `docs/specs/`                            | hand-written                    | everyone (the _what_)      |
| API reference   | `docs/reference/api.md` + `openapi.json` | **generated from Zod**          | UI/integration devs · LLMs |
| Data model      | `docs/reference/data-model.md`           | hand-written, mirrors `domain/` | designers · devs           |
| Product         | `docs/product/`                          | hand-written                    | PM · marketing             |
| Guides          | `docs/guides/`                           | hand-written                    | operators · contributors   |

### Who reads what

- **UI / integration developer** → `reference/api.md` and the live spec
  (`/openapi.json`, `/reference`); `reference/data-model.md` for field details.
- **Designer** → `reference/data-model.md` (what data and which enums exist) and
  `product/features.md` (what flows are possible).
- **Product manager** → `specs/SPECS.md` (intent ledger) and `product/features.md`
  (what we have) and `product/roadmap.md` (gaps & opportunities).
- **Marketing** → `product/features.md` (benefit-framed capability list).
- **AI agent** → `CLAUDE.md` is the hub; everything is linked and, where
  possible, machine-readable.

## Conventions

**Every doc starts with a header** so a reader (or model) instantly knows what
it is and whether to trust it:

```markdown
> **Audience:** UI developers · **Purpose:** how to call the API ·
> **Source of truth:** generated from `apps/api/src/api/` · **Last reviewed:** 2026-05-29
```

For generated docs, "Source of truth" names the code; for hand-written docs it
says `this file`. Update **Last reviewed** when you touch a hand-written doc.

**Indexes are maintained by hand.** `docs/decisions/README.md` keeps the ADR
index; the root `README.md` keeps the doc map. When you add a doc, add the link.

**Prose over cleverness.** Short sentences, concrete examples, real values.
Assume the reader is competent but new to _this_ project.

## The generated API spec

`docs/reference/openapi.json` is produced from the Zod route specs in
`apps/api/src/api/openapi.ts`:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
```

Do not hand-edit it. CI regenerates and fails the build if the committed file
differs from what the code produces, so the static file (read by codebase
tools) always matches the live `/openapi.json`. See
[ADR-0008](decisions/0008-documentation-method.md) for the rationale.

## Adding a new doc

1. Put it under the right type directory above.
2. Add the header block.
3. Link it from the root `README.md` doc map (and `CLAUDE.md` if agents need it).
4. If it documents a significant, hard-to-reverse choice, write an ADR instead
   of (or alongside) the doc — see [`docs/decisions/README.md`](decisions/README.md).
