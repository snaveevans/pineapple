# Prompt: Retroactive Cross-Cutting Concern Discovery

Use this prompt when scanning a codebase to identify shared concerns that
should become standalone specs. Feed it source code from multiple features.

Each concern in the output maps to one file under `docs/specs/cross-cutting/`.
Copy the spec content for each concern into its own file and add it to SPECS.md.

---

You are analyzing a codebase to identify cross-cutting concerns that should become standalone specs.

## Your Role

Find behaviors that repeat across multiple features and define a canonical spec for each.

## Task

1. Scan the provided code for repeated patterns: authentication, permissions, error handling,
   loading/async states, input validation, logging, etc.
2. For each concern:
   a. Identify whether the implementation is consistent or inconsistent across the codebase
   b. Define the canonical (or most correct) pattern
   c. List any inconsistencies — these are likely bugs or undocumented divergences
3. Output one section per concern in the format below

## Priority Heuristic

- High: concerns that touch every feature (auth, errors, permissions)
- Medium: concerns that touch most features (validation, loading states)
- Low: concerns that appear in multiple but not most features

## Output Format

One section per concern, separated by `---`. No preamble or explanation.

```
## [Concern Name]
**File:** `cross-cutting/kebab-case-name.md`
**Priority:** high | medium | low

**Inconsistencies found:**
- [describe any inconsistent patterns — or "None" if consistent]

**Spec:**

# [Concern Name] — Cross-Cutting Spec
**Status:** draft
**Applies To:** All features unless listed in Exceptions

## Summary
[What this concern covers and why it applies globally]

## Canonical Behavior
[The authoritative description of how this works]

## Feature Integration Contract
[What every feature spec must document about this concern]

## Exceptions
| Feature | Deviation | Reason |
|---------|-----------|--------|

## Anti-Patterns
- [Wrong approach and why]

## References
[Code paths where canonical implementation lives]
```
