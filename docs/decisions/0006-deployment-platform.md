# Deployment Platform

- Status: accepted
- Date: 2026-05-24

## Context and Problem Statement

The application needs a hosting platform for the API. The choice shapes more than just
infrastructure — the runtime environment determines which APIs are available in code, the
database determines the persistence strategy, and the auth approach determines how access
control is wired at the network level.

Key constraints: small team (two people), access control to specific email addresses is
required from day one, and the platform should not require significant ops overhead to keep
running.

## Decision Drivers

- No cold start latency — the app should respond immediately on the first request after idle
- Auth at the network level should be possible without writing a full auth system
- Free or near-free at low volume; cost should not scale with idle time
- Local development must closely mirror production to avoid environment-specific bugs
- SQLite is sufficient for the data model — no need for a full relational server
- Minimal ops overhead — no containers, no servers, no managed databases to maintain

## Considered Options

- **Cloudflare Workers + D1 + Cloudflare Access**
- **AWS Lambda + Aurora Serverless + Cognito**
- **Fly.io + PostgreSQL**

## Decision Outcome

Chosen option: **Cloudflare Workers + D1 + Cloudflare Access**, because it satisfies every
driver without compromise. V8 isolate startup is sub-millisecond — no cold starts. Cloudflare
Access puts auth in front of the Worker at the network level with zero application code
required. D1 is SQLite managed by Cloudflare — no database server to provision or maintain.
The free tier covers the expected volume indefinitely.

### Positive Consequences

- No cold starts — V8 isolates are already warm; first-request latency is network time only
- Cloudflare Access handles auth as a network policy — two email addresses, done — the
  application layer handles identity, not authentication
- D1 provides SQLite semantics with automatic replication and backups; no database server to
  run locally or in production
- `wrangler dev` runs a local Worker and D1 instance that is functionally identical to
  production — no Docker, no local Postgres, no mocking
- Cost is effectively zero at this scale; Workers and D1 have generous free tiers

### Negative Consequences

- The Workers runtime is **not Node.js** — it is a V8 isolate with the WinterCG subset of
  Web APIs. Most Node.js built-ins (`fs`, `path`, `process`, `Buffer`) are unavailable. Code
  must use Web APIs (`crypto.randomUUID()`, `fetch`, `Request`, `Response`)
- D1 is SQLite — no `RETURNING` clause support in all versions, no stored procedures, limited
  `ALTER TABLE` support. Schema migrations must be managed carefully
- Vendor lock-in is real: D1, Cloudflare Access, and the Workers runtime are Cloudflare
  products. Migrating to another platform would require replacing all three
- The per-request DI composition model (wiring dependencies fresh each request) is deliberate
  for the stateless Workers environment but differs from long-lived server patterns

---

## Platform Specifics

### Runtime

Cloudflare Workers runs V8 isolates, not Node.js. The available APIs are the
[WinterCG](https://wintercg.org/) subset:

- ✅ `crypto.randomUUID()`, `fetch`, `Request`, `Response`, `Headers`, `URL`
- ✅ `atob`, `btoa`, Web Streams, `TextEncoder`/`TextDecoder`
- ❌ `fs`, `path`, `os`, `process`, `Buffer`, `net`, `http`

All project code must use Web APIs only. `@cloudflare/workers-types` provides the type
definitions; `@types/node` must not be included in the API package.

### Database

Cloudflare D1 is a managed SQLite database. Key characteristics:

- SQL dialect is SQLite — use `datetime('now')` not `NOW()`, `INTEGER` not `SERIAL`
- Upsert pattern: `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`
- Migrations are plain `.sql` files applied with `wrangler d1 execute`
- Local development uses a local D1 instance via `wrangler dev` — no separate database process

### Auth

Cloudflare Access sits in front of the Worker as a network policy. Requests that pass the
Access policy arrive at the Worker with a `Cf-Access-Jwt-Assertion` header containing a signed
JWT. The application layer (`CloudflareAccessResolver`) reads the email from this JWT to
resolve the identity of the caller. Authentication — verifying who the caller is — is handled
by Cloudflare. Authorisation — deciding what they can do — is handled by application code.

For MVP, the JWT payload is trusted without signature verification (Cloudflare's network
policy has already validated the request). A future hardening step would verify the JWT
signature against the Cloudflare Access JWKS endpoint.

### Local Development

```bash
wrangler dev          # local Worker + local D1
wrangler deploy       # deploy to Cloudflare

wrangler d1 execute fieldops --local --file migrations/0001_initial.sql
wrangler d1 execute fieldops --remote --file migrations/0001_initial.sql
```

---

## Pros and Cons of the Options

### Cloudflare Workers + D1 + Cloudflare Access _(chosen)_

- ✅ Good, because sub-millisecond cold start — V8 isolates are always warm
- ✅ Good, because Cloudflare Access handles auth as infrastructure, not application code
- ✅ Good, because D1 removes all database ops overhead — no server, no backups to configure
- ✅ Good, because `wrangler dev` provides true local parity with production
- ✅ Good, because free tier covers this project's volume indefinitely
- ❌ Bad, because the Workers runtime excludes Node.js APIs — code must use Web APIs only
- ❌ Bad, because D1/SQLite has constraints not present in full relational databases
- ❌ Bad, because all three components are Cloudflare-specific — migration cost is high

### AWS Lambda + Aurora Serverless + Cognito

- ✅ Good, because Node.js runtime — the full ecosystem is available
- ✅ Good, because Aurora supports full PostgreSQL — no SQLite constraints
- ✅ Good, because Cognito provides a complete managed auth solution
- ❌ Bad, because Lambda cold starts are 100ms–1s+ depending on runtime and bundle size
- ❌ Bad, because Aurora Serverless v2 has a minimum cost even at zero traffic (~$7/month)
- ❌ Bad, because Cognito configuration is significantly more complex than Cloudflare Access
  for a two-person allow-list

### Fly.io + PostgreSQL

- ✅ Good, because persistent VM — no cold starts, full Node.js runtime, long-lived
  connections
- ✅ Good, because PostgreSQL has no SQLite constraints — full SQL, RETURNING, triggers
- ✅ Good, because straightforward to migrate away from if needed
- ❌ Bad, because requires a running PostgreSQL instance — local dev requires Docker or a
  managed dev database
- ❌ Bad, because no equivalent of Cloudflare Access — auth middleware must be written and
  maintained in application code
- ❌ Bad, because VMs sleep on free tier; paid plan required for always-on (~$7+/month)
