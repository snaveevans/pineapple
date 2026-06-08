---
audience: [api | web] contributors
purpose: [what this concern covers — one line]
source: this file
date: YYYY-MM-DD
---

<!--
A cross-cutting concern belongs to ONE package: it lives in
  apps/api/specs/cross-cutting/  or  apps/web/specs/cross-cutting/.
If the concern is a wire-level shape BOTH packages must implement identically (e.g.
the error envelope, the session handshake), it is a universal contract instead —
put it in docs/specs/universal/ and link it from each package's cross-cutting specs.
-->

# [Concern Name] ([API | Web]) — Cross-Cutting Spec

**Status:** `draft` | `review` | `active` | `deprecated`
**Owner:** [team]
**Package:** `apps/[api | web]`
**Applies To:** All [api | web] features unless listed in Exceptions
**Universal contract:** [link, if this concern references one]

---

## Summary

What this concern covers within its package, and any universal contract it
implements.

## Canonical Behavior

The authoritative description of how this works across the product.

## Feature Integration Contract

What every feature spec MUST document when this concern applies:

- [required field 1]
- [required field 2]

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **[Wrong approach]:** Why it's wrong and what to do instead
