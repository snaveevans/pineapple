## Summary

<!-- 1–3 bullets: what changed and why -->

## Related

<!-- Pick one. Drop this section only when there is no issue. -->
<!-- Closes #N  — this PR fully resolves the issue -->
<!-- Fixes #N   — same as Closes, for bugs -->
<!-- Refs #N    — partial slice; do not auto-close -->

## Risk

<!-- Agent always fills this — gate or bare /pr. Human may bump. -->
<!-- Prefer the validation-gate skill; if opening bare, score from the diff paths. -->
<!-- L = glance evidence only · M = evidence + spot-check · H = full review · C = human-approved ready packet required -->

**Level:** <!-- L | M | H | C -->

**Why:**

<!-- Path-glob floor, semantic elevations, agent override, and any product escalations. -->

**Human validation budget:**

<!-- Copy the matching line from the level:
     L — Glance evidence. Do not read the diff.
     M — Evidence + escalations; spot-check 1–2 hot files.
     H — Full review + local poke on auth/API/data paths.
     C — Stop if the ready packet was not human-approved; deep review required. -->

## Intent / Spec / Evidence

<!-- Feature/change: link the accepted Intent Brief and approved ready gate,
     list affected OUT-*/INV-* IDs, then link the spec + slice/criteria.
     Bug: link the corrective issue and updated spec; no Intent Brief is needed.
     Behavior-preserving work: state the exception instead of inventing artifacts. -->

**Authority:**

**Spec / slice:**

| Authority (`OUT-*` / `INV-*` / bug `#N`) | Claim | Named proof | Result | Remaining uncertainty |
| ---------------------------------------- | ----- | ----------- | ------ | --------------------- |
|                                          |       |             |        |                       |

**Human evidence verification:** <!-- pending | verified by @name on YYYY-MM-DD -->

## Test plan

- [ ]
- [ ]

## Validation gate

<!-- Filled by validation-gate skill when used. Drop section if not run. -->

- [ ] Rebased on latest `main`
- [ ] Lint / type-check / tests green locally
- [ ] Adversarial review run (`pr-review`)
- [ ] Safe findings self-fixed; product escalations listed below
- [ ] Intent / spec AC / evidence / FEATURES.md updated if required
- [ ] OpenAPI + web `api:types` regenerated if contract changed

**Escalations (need human decision):**

<!-- None, or bullet each ambiguous product/architecture call. -->
