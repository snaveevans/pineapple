# Pin checklist

A behavior is **pinned** only when a test would fail the way the plan fears,
not merely when a status code is asserted. Work through each row against the
tests you read.

---

## Leftovers and side effects

- Embed / store / index (or any other port the spec names) can fail
  independently. Each injection has its own test.
- Every `500` dual-write test asserts **count / presence on every store**, not
  only HTTP. "500 and we didn't look at D1" is Status-only.
- Compensation paths: store-fail-after-index asserts the vector is gone;
  index-fail-after-store asserts the row is gone.
- `400` / `401` / missing-config `500` assert **zero writes and embedder not
  called**.
- Retry-after-500 is a new create if the spec says so (two POSTs, two ids) —
  only if the plan required it.

## Auth before work

- Missing, wrong, empty, and whitespace `x-api-key` share one `401` body.
- At least one test sends **invalid JSON or empty content without a key** and
  still expects `401`, not `400`. That is the before-parse pin.
- Missing server `API_KEY` is `500` with the configured-key message, and writes
  nothing.
- Key is not accepted from query, JSON body, or `Authorization`.
- Persist spy: the stored document has no key-shaped field.
- Error bodies never echo the presented or configured key.

## Strings and cases

- Each documented validation message is asserted **exactly**, on the case it
  belongs to.
- A metadata message is not used for a non-object body (or any other different
  case).
- Invalid JSON and valid-but-not-an-object are different tests.

## Defaults, trim, coupling

- Omitted / empty / whitespace-only fields match the spec (including `source`
  → `"manual"` when specified).
- Trimmed `content` is what the **store and the embedder** both saw. A
  response-only trim check is Status-only.
- Stored text equals embedded text on success. Oversize is a reject, not a
  truncate, when the spec says so.
- Create-style embed uses the **document** task if the plan requires that spy.
  A 201 with no task assertion will not catch a silent prefix bug.

## Server-owned fields

- Caller-supplied `id`, timestamps, `embedding_model`, `similarity` do not
  stick (rejected or ignored — whatever the spec/plan said).
- `similarity` is absent on create responses if the spec says so.
- Two sequential creates get two ids.

## Boxes and honesty

- A spec `[x]` has a pinning test on this branch (or already on `main` if this
  slice did not touch that box).
- New ACs added by `test-author` are not checked off with a status-only test.
- Tests do not encode behavior the spec never recorded. If they do, that is a
  plan-vs-spec disagreement, not a free pass.

## Do not require

- P2 items (header case, logger greps, timing-safe microbenchmarks)
- Search / fetch / CLI coverage on a create issue
- Line coverage percentages
- Production-handler walkthroughs
