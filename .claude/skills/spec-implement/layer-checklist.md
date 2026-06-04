# Layer Checklist

For each layer the spec requires, work through the relevant section. Skip layers that are not touched and state why.

---

## Domain (`apps/api/src/domain/`)

- [ ] Define or update the aggregate (extends `AggregateRoot` if it produces events)
- [ ] Define value objects for any constrained fields (use branded types from `packages/shared/`)
- [ ] Define domain events for any state changes (extends `DomainEvent`); call `this.addEvent()` inside the aggregate method
- [ ] Write unit tests for aggregate behavior, value object validation, and domain event emission
- [ ] Verify: domain layer imports only `packages/shared/` — no application, infrastructure, or API imports

## Application (`apps/api/src/application/`)

- [ ] Define port interfaces the use case needs (repository, event bus, external service) in `application/ports/`
- [ ] Implement the use case class; return `Result<T, DomainError>` — never throw domain errors
- [ ] Use case calls `eventBus.publishAll(aggregate.pullEvents())` after a successful state change
- [ ] Write unit tests using in-memory fakes for all ports
- [ ] Verify: application layer imports only domain and shared — no infrastructure or API imports

## Infrastructure (`apps/api/src/infrastructure/`)

- [ ] Implement the D1 repository; use the `DB` binding, never `process.env`
- [ ] Map D1 rows to domain objects; map domain objects to insert/update statements
- [ ] If the feature produces a new domain event: create a telemetry handler in `infrastructure/telemetry/` following `AssetCreatedTelemetryHandler` as the pattern; define the full ordered `blobs[]` and `doubles[]` contract per `telemetry.md`; register the handler in `registerDomainTelemetry()`
- [ ] Write any necessary D1 migrations in `/migrations/` and apply locally: `pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --local`
- [ ] Verify: infrastructure layer imports application, domain, and shared — never imports `api/` layer

## API (`apps/api/src/api/`)

- [ ] Define Zod request/response schemas in `api/schemas/` using `z` from `@hono/zod-openapi`; add `.openapi()` metadata to every schema
- [ ] Define the route spec in `api/` (pure schema + metadata, no handler logic)
- [ ] Map domain errors to HTTP responses in `api/errors.ts` if any new `DomainError` subclass is introduced
- [ ] If a new route is added, add it to the operation name mapping in `api/middleware/technicalTelemetry.ts` and update `telemetry.md`
- [ ] Verify: `api/` layer imports application, domain, and shared — never imports `infrastructure/`

## Worker (`apps/api/src/worker.ts`)

- [ ] Instantiate infrastructure dependencies (repository, sinks) using `c.env` bindings — never `process.env`
- [ ] Instantiate the use case, injecting the infrastructure implementations
- [ ] Register the route handler, passing the use case; throw `result.error` on failure to let `app.onError` handle it
- [ ] Verify `exactOptionalPropertyTypes` compliance when passing Zod-parsed data to domain types — cast at the boundary if needed

## Frontend (`apps/web/src/`)

- [ ] Implement the page/component at its route path
- [ ] Use `apiRequest()` from `apps/web/src/api/client.ts` for all API calls; never fetch directly
- [ ] Handle loading, error, and empty states per `loading-states.md`
- [ ] On 401, redirect to `/login` — handle this at the API client layer, not inside the component
- [ ] Map `ApiError.field` back to form field errors using the pattern in `toAssetFormError()` if the feature has a form
- [ ] Test any non-trivial presentation logic (summary formatting, derived display values)
