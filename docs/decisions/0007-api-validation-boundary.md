# API Validation Boundary

- Status: accepted
- Date: 2026-05-21

## Context and Problem Statement

Two distinct validation concerns exist in the codebase and they should not be conflated.
The first is structural: does the incoming HTTP request body have the right shape — is `name`
a string, is `metadata.kind` one of the known values? The second is semantic: does the data
satisfy business rules — is the name non-blank after trimming, is the vehicle year plausible?

These concerns belong in different layers. The question is where each one lives and what
tooling, if any, handles it.

## Decision Drivers

- The domain must be the authoritative source for business rule validation — invariants should
  not be enforced only at the API boundary, where they can be bypassed by any other caller
- HTTP request parsing should fail fast with a clear error before domain code runs
- Zod schemas provide TypeScript type inference from runtime parsing — the parsed value is
  typed without manual type assertions
- Domain validation code must not depend on a third-party schema library

## Considered Options

- **Zod at the API boundary, domain validates its own invariants** — Zod parses request
  bodies; domain throws `ValidationError` for business rule violations
- **Zod everywhere** — Zod schemas used for both HTTP parsing and domain validation
- **Manual validation at the API boundary** — hand-written checks before domain code runs;
  domain validates its own invariants as above

## Decision Outcome

Chosen option: **Zod at the API boundary, domain validates its own invariants**, because each
layer uses the tool that fits it. Zod is well-suited to parsing untrusted external input and
producing typed values with good error messages. Domain validation is business logic — it
belongs in the domain, expressed in plain TypeScript, with no library dependency.

Some validation logic intentionally appears in both places. Zod checks `name: z.string().min(1)`;
the domain also rejects a blank name. This is deliberate: Zod fails fast with a shaped error
before any domain code runs, while the domain enforces the invariant regardless of how it was
called. The domain check is the guarantee; the Zod check is the early exit.

### Positive Consequences

- Domain invariants are enforced by the domain itself — they cannot be bypassed by a caller
  that skips the API layer
- Zod provides typed, inferred values after parsing — no `as` casts needed in route handlers
- The domain layer has no dependency on Zod — it can be tested and reasoned about without it
- Zod's discriminated union support handles the `AssetMetadata` variants cleanly at the
  boundary

### Negative Consequences

- Some validation logic is duplicated between Zod schemas and domain code — a change to a
  business rule (e.g. minimum name length) must be updated in both places
- Developers must know which layer owns which check; the rule is "domain is the authority,
  Zod is the early exit"

---

## Where Each Concern Lives

| Concern                                                      | Layer                                 | Tooling                                        |
| ------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------- |
| Request body has correct shape and types                     | `api/`                                | Zod `safeParse`                                |
| Business rule violations (blank name, invalid year, bad VIN) | `domain/`                             | `throw new ValidationError(...)`               |
| Auth token present and valid                                 | `infrastructure/` + `api/` middleware | Cloudflare Access + `CloudflareAccessResolver` |

## Pattern

```ts
// api/routes/assets.ts — Zod parses the request body
const parsed = CreateAssetSchema.safeParse(body);
if (!parsed.success) {
  return toHttpError(c, new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input"));
}

// Domain receives already-typed data, enforces its own invariants
const result = await createAsset.execute({
  ownerId: user.id,
  name: parsed.data.name, // typed as string
  metadata: parsed.data.metadata, // typed as AssetMetadata discriminated union
});
```

Zod schemas live in `apps/api/src/api/` alongside the routes that use them. They are not
shared with the domain layer and are not exported as public types.

---

## Pros and Cons of the Options

### Zod at the API boundary, domain validates its own invariants _(chosen)_

- ✅ Good, because domain invariants are enforced wherever the domain is called, not just
  through the HTTP entry point
- ✅ Good, because domain code has no Zod dependency — it is plain TypeScript
- ✅ Good, because Zod's `safeParse` + discriminated unions handle the `AssetMetadata` shape
  cleanly without manual switching
- ❌ Bad, because some rules are expressed twice — once in Zod, once in domain validation

### Zod everywhere

Zod schemas defined once and used for both HTTP request parsing and domain validation. The
domain calls `schema.parse()` internally rather than writing manual validation.

- ✅ Good, because validation logic is defined once — no duplication
- ❌ Bad, because the domain takes a dependency on Zod — a third-party library becomes part
  of the domain's contract
- ❌ Bad, because Zod's error model (`ZodError`) leaks into domain code, where `ValidationError`
  should be the only error type
- ❌ Bad, because Zod schemas are optimised for parsing external input, not for expressing
  domain invariants — `year < 1900 || year > currentYear + 1` is awkward as a Zod refinement

### Manual validation at the API boundary

Hand-written checks in route handlers before invoking the use case; domain validates its own
invariants as above.

- ✅ Good, because no dependency on Zod — pure TypeScript throughout
- ❌ Bad, because manual HTTP input parsing is verbose and error-prone — discriminated unions
  like `AssetMetadata` require significant hand-written switching and type narrowing
- ❌ Bad, because Zod's `safeParse` provides typed output for free; manual parsing requires
  explicit type assertions that undermine `strictNullChecks`
