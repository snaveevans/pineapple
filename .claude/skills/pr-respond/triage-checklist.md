# Triage Checklist

Run every surviving comment, review, and failing check through these tests, in order. The
first test that lands decides the bucket. Stop there — an item belongs to exactly one
bucket, and an item you cannot place is an item to escalate, not to guess at.

The reason this is a checklist rather than a judgment call is that the pressure runs one
way. A reviewer wrote the comment, so patching it feels cooperative and pushing back feels
rude. That instinct produces branches that sprawl, fixes for problems that do not exist,
and commits nobody can justify later. These tests are the counterweight.

---

## Test 1 — Is it a request at all?

Not every comment asks for something. Praise, acknowledgment ("makes sense"), thinking out
loud, and a reviewer answering their own question need no action.

→ **Nit / praise / ack.** Skip silently. A reply here is noise.

A nit is a stylistic preference the repo does not encode anywhere — not in `CLAUDE.md`,
not in lint, not in an ADR. If a human reviewer would shrug at it, so should you. But note
the asymmetry: if the reviewer marked it "nit" and it is _also_ a two-line change you are
already touching, doing it is cheaper than the reply explaining why you did not.

## Test 2 — Is it a question rather than a change request?

"Why is this computed here?" and "Did you consider X?" are requests for _understanding_,
not for code. Answering a question with a commit is a common and expensive mistake: you
have now changed working code because someone was curious.

→ **Question.** Answer in the thread, cite the ADR or spec if one governs it, write no
code.

If the answer turns out to be "you're right, this is wrong" — that is Test 4 territory.
Re-run it.

## Test 3 — Is it real?

Verify before you believe it. A finding survives only if you can point at the code and
state the failure.

- **Read the current code**, not the diff hunk quoted in the comment. The line may have
  moved, changed, or already been fixed in a later commit on this branch.
- **Reproduce the reasoning.** Can you name the input, state, or call path that produces
  the bad outcome? "This could break" without a mechanism is not a finding.
- **Check what CI already enforces.** Layer-boundary violations, floating promises,
  `process.env` and Node built-ins under `apps/api/src/**`, type errors, formatting, and a
  stale `openapi.json` all turn the PR red on their own. If CI is green, a comment
  claiming one of these is mistaken.
- **Check for an explicit silence.** A lint-ignore or a comment explaining the choice
  means someone already decided this. Deferring to a review comment over a documented
  decision is how deliberate code gets undone.

→ Fails any of these: **Incorrect.** Reply once with the evidence — the file:line, the
guard that already handles it, the ADR that decided it. Say it plainly and without
hedging, then stop. You get one round; if the reviewer disagrees, that is a human
conversation, and continuing to argue from a script is worse than silence.

## Test 4 — Was it caused by this PR?

The question is not "is this code bad" but "did this branch make it that way".

- **Pre-existing code the diff never touched** → not this PR's problem, even if the
  observation is correct.
- **Code the diff touched** → in play, including a latent bug this change surfaced or made
  reachable.
- **Code the diff broke** → unambiguously in play, however small.

→ Pre-existing and untouched: treat as **out of scope** (Test 5's action), not as
"incorrect". The reviewer is right about the code; they are just describing work for a
different branch.

## Test 5 — Is it inside this branch's concern?

`CLAUDE.md` is explicit: a branch delivers one concern, and reviewer "and also…" work
becomes a follow-up branch. Name this PR's concern in one sentence — from the PR body and
its spec — and hold each finding against it.

Out of scope, no matter how good the idea:

- A rename or refactor of code that is adjacent to the change but not part of it.
- A new mechanism (queue, table, migration, ADR-level pattern) the PR does not already
  introduce.
- A feature or edge case the spec does not cover.
- Anything that would push the diff meaningfully past ~40 files or ~800 net lines.

In scope even though it grows the diff:

- A test for behavior this PR introduces.
- A doc update this change makes necessary — the spec checkbox, `SPECS.md`,
  `docs/web/FEATURES.md` for a web flow change, the regenerated `openapi.json`.
- A fix to something this PR broke.

→ **Valid, out of scope.** Reply, propose the follow-up issue, and leave the code alone.
Absorbing it silently is the exact drift `CLAUDE.md` names as the failure mode.

→ **Valid, in scope.** Fix it.

## Test 6 — Would the fix violate a repo convention?

The last gate before the fix bucket is real. A reviewer with partial context can ask for
something that conflicts with the architecture: a `use case` that throws instead of
returning `Result`, an `api/` module importing `infrastructure/`, a client recomputing a
derived value that ADR-0009 puts in the application layer, a raw string standing in for a
branded ID.

→ **Escalate.** Do not implement it, and do not simply refuse. Tell the user what the
reviewer asked for, which convention it collides with, and what you would do instead.
Either the convention has a real exception here, or the reviewer needs a reply explaining
the constraint — both are the human's call.

---

## Failing checks

CI runs through an abbreviated path, because a red check is not an opinion:

1. **Read the job log.** Get the actual failing assertion or error, not the summary line.
2. **Does it reproduce on the base branch?** If the same check fails on base with this
   diff absent, it is not yours. Say so once in the thread — "CI red on `<check>`, failing
   on the base branch too, will re-run when it recovers" — and act on the recovery when it
   comes. This is the only legitimate "not mine" outcome for CI, and it is still not
   silent.
3. **Otherwise it is in scope**, full stop. Flaky, unrelated-looking, or caused by a
   dependency — it blocks the merge, so it is this run's work. Re-running a flake counts
   as addressing it; assuming it is a flake without checking does not.

---

## Quick reference

| Test                               | Yes →                        | No →                                     |
| ---------------------------------- | ---------------------------- | ---------------------------------------- |
| 1. A request at all?               | continue                     | **Nit / praise / ack** — skip            |
| 2. Asking for code, not an answer? | continue                     | **Question** — answer in thread          |
| 3. Verifiably real?                | continue                     | **Incorrect** — reply with evidence      |
| 4. Caused or touched by this PR?   | continue                     | **Out of scope** — reply + propose issue |
| 5. Inside this branch's concern?   | continue                     | **Out of scope** — reply + propose issue |
| 6. Fix respects repo conventions?  | **Valid, in scope** — fix it | **Escalate** to the user                 |
