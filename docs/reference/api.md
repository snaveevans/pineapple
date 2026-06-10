# API Reference

> **Audience:** UI & integration developers, LLMs · **Purpose:** how to call the
> Pineapple API · **Source of truth:** generated from `apps/api/src/api/` —
> the exhaustive contract is [`openapi.json`](openapi.json)

This page is the narrative guide. For the precise, machine-readable contract
(every field, type, and status code), use the OpenAPI spec:

- **Static spec (in repo):** [`docs/reference/openapi.json`](openapi.json)
- **Live spec:** `GET /openapi.json`
- **Interactive docs (Scalar):** open `/reference` in a browser
- Local API base URL: `http://localhost:8787` · Local browser requests:
  same-origin `/api/*` through Vite at `http://localhost:5173` · Production:
  same-origin `/api/*`

The spec is generated from the Zod schemas, so it never drifts from the running
code. If this prose and the spec disagree, the spec wins.

## Authentication

Auth is **Better Auth + Google OAuth**, handled inside the Worker under
`/api/auth/*`. Every other `/api/*` route requires an authenticated session.

**Flow:**

1. Send the user to `GET /api/auth/sign-in/social?provider=google`.
2. Better Auth redirects to Google, then back to
   `/api/auth/callback/google`, and sets a **session cookie**
   (`better-auth.session_token`).
3. The browser includes that cookie automatically on subsequent `/api/*`
   requests. (Send credentials: `fetch(url, { credentials: "include" })`.)
4. `GET /api/auth/get-session` returns the current session, or `null` if signed
   out.

The API maps the session to a domain user by email, creating the user on first
sign-in. There is no separate "register" step.

> **Local development:** set `DEV_AUTH_EMAIL` in `apps/api/.dev.vars` to bypass
> the session check entirely — every request is treated as that user. Never set
> it in production. See [getting-started](../guides/getting-started.md).

## Endpoints

| Method | Path                                        | Auth | Description                              |
| ------ | ------------------------------------------- | ---- | ---------------------------------------- |
| GET    | `/health`                                   | no   | Liveness check                           |
| GET    | `/openapi.json`                             | no   | The OpenAPI spec                         |
| GET    | `/reference`                                | no   | Interactive API docs (Scalar)            |
| `*`    | `/api/auth/*`                               | —    | Better Auth (sign-in, callback, session) |
| POST   | `/api/assets`                               | yes  | Create an asset                          |
| GET    | `/api/assets`                               | yes  | List the caller's active assets          |
| GET    | `/api/assets/{id}`                          | yes  | Get one asset the caller owns            |
| POST   | `/api/assets/{assetId}/maintenance-records` | yes  | Create a maintenance record              |
| GET    | `/api/assets/{assetId}/maintenance-records` | yes  | List an asset's maintenance history      |

See [`data-model.md`](data-model.md) for the shape of an asset and its metadata
variants.

### Example: create an asset

```http
POST /api/assets
Content-Type: application/json

{
  "name": "My Truck",
  "metadata": { "kind": "vehicle", "make": "Ram", "model": "2500", "year": 2016 }
}
```

```http
201 Created
{ "id": "195d0ef0-47f5-439f-abfd-29f892c9a040" }
```

## Errors

All errors share one JSON shape:

```json
{ "error": "human-readable message", "field": "metadata.year" }
```

`field` is present only for validation errors. Status codes:

| Status | Meaning                                     |
| ------ | ------------------------------------------- |
| 401    | Not authenticated (no/expired session)      |
| 403    | Authenticated, but the resource isn't yours |
| 404    | Resource not found                          |
| 409    | Conflict (e.g. uniqueness violation)        |
| 422    | Request body/params failed validation       |
| 500    | Unexpected server error                     |

These map directly to the domain error types (see
[ADR-0004](../decisions/0004-error-handling-strategy.md)). Structural validation
(shape/types) happens at the HTTP edge via Zod; business-rule validation lives
in the domain (see [ADR-0007](../decisions/0007-api-validation-boundary.md)).

## Conventions

- All request and response bodies are JSON.
- IDs are UUID strings.
- Timestamps are ISO-8601 UTC strings (e.g. `2026-05-29T03:25:24.887Z`).
- Maintenance `performedAt` values are timezone-free calendar dates in
  `YYYY-MM-DD` format.
- `GET /api/assets` returns only **active** assets (archived ones are excluded).
- You can only read assets you own; requesting another user's asset returns 403.
