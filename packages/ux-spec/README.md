# @snaveevans/pineapple-ux-spec

> **Audience:** contributors · **Purpose:** spike — can UX be specified in plain
> text and enforced like the API spec? · **Source of truth:** `screens/*.yaml` ·
> **Last reviewed:** 2026-07-29

**This is an experiment, not an adopted convention.** One screen, one subset of
its states. It is not wired into CI. Nothing imports the generated copy catalog
yet. The point is to find out whether the idea survives contact with real
content before committing to it.

## The idea

`openapi.json` cannot drift because **code is the source and the doc is the
artifact** — `openapi:generate` regenerates and CI runs `git diff --exit-code`.

UX has no equivalent source to derive from: the implementation is the thing you
want to _check_, not generate from. So the arrow flips. Text is the source, and
implementations are checked against it — which needs two mechanisms, not one:

| Tier            | Mechanism                                        | In this spike              |
| --------------- | ------------------------------------------------ | -------------------------- |
| **Generated**   | spec → artifact, `git diff --exit-code`          | `ux.json`, `copy.ts`       |
| **Conformance** | spec asserts something about the code            | `ux:verify`                |
| **Prose**       | not enforceable, stays in `docs/web/FEATURES.md` | (deliberately absent here) |

The rule that keeps the YAML honest: **nothing belongs in it unless a generator
emits it or a check asserts it.** Anything else is inert config wearing a spec
costume — worse than prose, because it looks authoritative while nothing keeps
it true.

## Running it

```bash
pnpm --filter @snaveevans/pineapple-ux-spec ux:generate   # screens/*.yaml → generated/
pnpm --filter @snaveevans/pineapple-ux-spec ux:verify     # generated/ux.json vs. the web implementation
```

`ux:verify` reads each declared copy string and asserts it appears in the source
file the spec names. Parameterised copy (`No {category} yet`) is checked
segment-by-segment, since the implementation interpolates the value. Change a
string in `AppAssets.tsx` without updating the YAML and it fails:

```
✗ asset-library[web].empty.title: "No assets yet" not found in apps/web/src/app/AppAssets.tsx
```

## What the spike found

1. **`docs/web/FEATURES.md` is already missing a state.** The web app implements
   and tests a `Redirecting to sign in` state for 401s; the prose spec's "Key
   states" list for Asset Library does not mention it. Writing the structured
   version surfaced it immediately — which is the argument for doing this.
2. **Action labels duplicate across states.** `Add asset` appears in both `empty`
   and `filtered-empty`, so it lands twice in the catalog. Actions probably need
   their own catalog with states referencing them by id.
3. **The flattened copy catalog loses metadata.** `fallbackFor` on the error body
   survives into `ux.json` but not into `copy.ts`. Either the catalog carries the
   metadata or platforms have to read `ux.json` — unresolved.
4. **Copy conformance is checkable with zero changes to app code.** State
   coverage is not: proving "every declared state has a test" needs a tagging
   convention in the test files. That is a real, and larger, cost.

## Open questions

- Does copy belong co-located under each state (as here) or in a separate
  catalog file? Co-location authored well; it duplicated on generate.
- Is verbatim string matching the right conformance check, or should
  implementations import `copy.ts` so that drift is impossible by construction
  rather than merely detected? The latter is stronger and a much bigger refactor.
- Where does the per-platform adaptation slot live — in the state, or alongside
  it? Not modelled yet.

## Scope

Deliberately **not** in this spike: design tokens, the component inventory,
`populated`/`filtered` states, any second screen, any CI wiring, any change to
`apps/web`.
