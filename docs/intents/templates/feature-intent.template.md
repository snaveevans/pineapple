---
name: [short kebab-case name]
description: [durable outcome in one line]
metadata:
  type: intent
---

> **Audience:** [product owners and affected engineers/agents] · **Purpose:**
> authoritative intent for [capability] · **Source of truth:** this file ·
> **Last reviewed:** YYYY-MM-DD

# Intent: [Short Name]

**Status:** `draft` | `accepted` | `superseded` | `retired`
**Ready Gate:** `pending` | `approved YYYY-MM-DD`
**Approved By:** `pending` | [human approver]
**Approval Record:** `pending` | [durable link or reference to the explicit approval]
**Owner:** [product owner]
**Last Updated:** YYYY-MM-DD
**Related Specs:** [links, or `none yet`]
**Related ADRs:** [links, or `none`]

## Problem

Why does this need to exist? Describe what is undesirable, difficult, risky, or
impossible today without prescribing a solution.

## Desired Outcomes

- **`OUT-1`** [What should become true for a user, the business, or the system]
- **`OUT-2`** [Another durable outcome]

## Affected Users and Systems

[Who or what this applies to, with boundaries that prevent accidental expansion.]

## Invariants

- **`INV-1`** [A rule that must remain true regardless of implementation]

## Constraints

- [Only genuine limits on acceptable solutions]

## Non-Goals

- [What this intent deliberately does not solve]

## Success and Evidence Expectations

- **`OUT-1`** [What evidence would convincingly demonstrate this outcome]
- **`INV-1`** [What evidence would convincingly protect this invariant]

Describe the standard of proof, not filenames, test helpers, endpoints, or
implementation mechanics. The linked spec owns the layered evidence plan.

## Approved Architecture Direction

[The component boundaries, responsibilities, compatibility/rollout constraints,
and accepted ADR links included in the ready packet. Keep routine mechanics in
the downstream spec.]

## High-Level Delivery Boundaries

[The approved dependencies, sequencing boundaries, and scope splits. Do not put
detailed delivery slices or test names here.]

## Remaining Uncertainty

[What remains uncertain after approval, or `none`. Material unresolved product
questions belong in Open Questions and block acceptance.]

## Open Questions

Material questions only. An intent cannot become `accepted` until each question
is answered or explicitly moved outside this intent's scope.
