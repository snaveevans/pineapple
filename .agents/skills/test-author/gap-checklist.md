# Gap checklist

Work through each concern against the **spec and issue**, not the code.
A gap is either a product call (ask), a spec edit (behavior), or a test idea
(issue comment). Do not invent the missing policy.

---

## Auth and trust

See `docs/specs/cross-cutting/authentication.md` when the feature is
authenticated.

- Does auth run before body parse and domain work? A 401 on invalid JSON or
  empty content is the test that proves it.
- Missing vs wrong vs empty vs whitespace `x-api-key` — same 401 body?
- Missing server `API_KEY` — 500 fail-closed, not a public route?
- Key accepted anywhere it must not be (query, JSON body, `Authorization`)?
- Is the key treated as a subject, owner, or stored field?
- Does any error body echo the presented or configured key?

## Validation

- Required vs optional vs omitted vs empty vs whitespace-only — each field,
  separately.
- Wrong JSON types (`null`, number, bool, array, object) for every accepted
  field.
- Valid JSON that is not the documented shape (top-level `[]`, `"x"`,
  `42`). This is **not** the same case as a bad field.
- Invalid JSON (`{`, empty body, form-encoded) vs valid-but-wrong.
- Extra / attacker-supplied server-owned fields (`id`, timestamps,
  `embedding_model`, `similarity`). Ignore or reject — pick one and pin that
  none of the attacker values stick.
- Unicode, interior whitespace, null bytes, oversize. Silent truncate is a
  corruption bug if two sides of a write can disagree.

Do not reuse an error string for a different case. Propose a new one.

## State and leftovers

The expensive bugs are partial success.

- What is written on the happy path (row, vector, both)? In what observable
  order?
- For **each** dependency failure (embed, document store, index, clock): HTTP
  status, body, **and** leftover state on every store.
- If the handler compensates (delete the row, delete the vector), what happens
  when compensation itself fails? Usually still `500`, no 201, leftovers
  possible — say that; do not pretend an in-request delete is a transaction.
- Validation / 401 / missing-config must write nothing and should not call the
  embedder.
- Retry after `500` is a **new** create unless the spec says otherwise (no
  silent upsert).
- Two identical successes are two records unless upsert is in scope.

## Time, identity, concurrency

- Who assigns `id`? UUID version/format if the spec cares.
- `created_at` / `updated_at` / `embedded_at` on first write — equal? Clock-skew
  if they come from different places?
- Parallel requests must not share an id or clobber each other.
- Idempotency keys? If unspecified, assume none.

## Cross-feature coupling

- A write here becomes a fetch / search / delete later. Does create promise an
  embedding that search will rely on?
- Does a failure mode produce a row that later specs treat as legal (fetchable,
  un-embedded) even though _this_ feature promised embed?
- Eventual consistency the caller can observe (201 then search miss) belongs in
  the spec as a warning, not only in an ADR.

## Observability and secrets

- Spec says do not log content, metadata, keys, embeddings. If the plan needs a
  logger assertion, put it on the issue, not in the spec.
- Future telemetry / queue / repair is Out of Scope until a spec exists. Do not
  add ACs for it.

## HTTP / surface

See `docs/specs/features/rest-api.md` for the shared envelope.

- Wrong method → `405`. Unknown path → `404`. Trailing slash.
- `Cache-Control: no-store` on authenticated responses and `/health`.
- Content-Type missing or wrong — pin `400` vs `415`.
- Envelope is `{ error: string }` or the success shape. No extra top-level keys
  unless specified.

## What to put where

After the pass, every item is one of:

1. **Spec row / message / AC** — caller can observe it
2. **Issue-comment test** — how we will prove (1)
3. **Question** — still unspecified; ask or park
4. **ADR candidate** — hard to reverse; offer `adr-author`
5. **Out of scope** — name it so it cannot sneak into this slice
