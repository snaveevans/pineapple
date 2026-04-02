
# FieldOps Backend Learning Project Spec

## Purpose

This document is the working specification for **FieldOps**, a garage project designed to teach practical backend engineering on the Cloudflare platform while still building transferable backend skills.

The project is intentionally structured to cover:

- REST API design
- GraphQL API design
- authentication and authorization
- relational data modeling
- asynchronous/background processing
- synchronous service communication
- real-time frontend/backend communication
- coordination/stateful distributed primitives
- observability and testing
- production-minded architecture tradeoffs

This spec is written to be used as a build reference while working with ChatGPT Codex.

---

## Core Decision

We will build on **Cloudflare**, using its platform as the primary learning environment.

This is acceptable and worthwhile because the project goals are centered around learning backend concepts, not reproducing a traditional Kubernetes or VM-hosted stack from day one.

### What Cloudflare is good for in this project

- Fast deployment and iteration
- Real serverless edge compute with Workers
- First-class async processing with Queues
- Real coordination primitives with Durable Objects
- Good fit for real-time connections
- Simpler operational burden than self-running infra
- Forces clean boundaries and stateless thinking

### What Cloudflare will not fully teach by itself

- Traditional long-running Node server patterns
- Typical Postgres operational model
- Kafka-style infra ownership
- Kubernetes networking and deployment operations
- Conventional microservice hosting concerns

That is acceptable. The plan is to learn core backend architecture first, then optionally compare one subsystem against a more traditional backend later.

---

## Project Overview

## Name

**FieldOps**

## Product Summary

FieldOps is a small, real-time maintenance and task coordination app for a family property operation or small handyman crew.

Users can:

- create properties and assets
- create and assign maintenance tasks
- add comments and updates
- track task history
- receive notifications
- see live task updates in the UI
- view simple dashboards
- generate weekly summaries

The app is intentionally practical, but small enough to finish.

---

## Learning Goals

This project should teach the following in order of importance:

1. Design and ship a clean REST API
2. Learn Cloudflare Workers runtime and deployment model
3. Model relational data in D1
4. Build authentication and route protection with Better Auth
5. Add queue-based asynchronous workflows
6. Learn idempotency and retry-safe processing
7. Build synchronous service-to-service communication
8. Use Durable Objects for coordination
9. Add WebSocket-based real-time updates
10. Add GraphQL only after REST is stable
11. Add durable multi-step orchestration if needed
12. Build production-minded testing and observability habits

---

## Chosen Stack

## Runtime and Platform

- **Cloudflare Workers** for compute
- **Wrangler** for local dev, config, migrations, deployment
- **Cloudflare D1** for relational application data
- **Cloudflare Queues** for background processing
- **Cloudflare Durable Objects** for real-time coordination
- **Cloudflare WebSockets** via Durable Objects for live updates
- **Cloudflare R2** optional later for photo/file attachments
- **Cloudflare Workflows** optional later for durable multi-step processes

## API Layer

- **Hono** for REST APIs
- **GraphQL Yoga** later for GraphQL APIs
- **Zod** for validation
- **Better Auth** for authentication

## Language and Tooling

- **TypeScript**
- **Vitest** for unit/integration tests
- **Miniflare / Wrangler local runtime** for Worker-like testing
- **Playwright** later for end-to-end flows
- **ESLint**
- **Prettier**

---

## Big Architectural Rules

These rules are meant to keep the project clean and avoid chaos.

### 1. Start monolithic, not microservices-first

The initial implementation should be a **modular monolith** deployed as one Worker application.

Reason:
- simpler to ship
- easier to reason about
- fewer moving parts
- still allows internal service boundaries in code

A second service can be introduced later when synchronous service communication becomes a targeted learning goal.

### 2. REST before GraphQL

REST comes first.

GraphQL is explicitly deferred until:
- the data model is stable
- the REST resources are well understood
- the first frontend views already exist

### 3. Better Auth instead of hand-rolled auth

Authentication will use **Better Auth** from the start.

We will not build our own password/session system.

### 4. Durable Objects only where coordination is needed

Durable Objects should not become the main persistence layer.

Use them only for:
- live room/session coordination
- presence
- connection fan-out
- temporary ordered event handling
- coordination-heavy state

### 5. Queue-driven async work must be idempotent

Every queue consumer must be safe to retry.

No consumer should assume a message is processed exactly once.

### 6. Keep the domain model independent from transport details

Business rules should not live directly inside route handlers.

The code should preserve separation between:
- HTTP transport
- auth/session context
- domain/application logic
- data access
- external integrations

---

## High-Level Architecture

## Initial Shape

A single Worker application contains:

- REST API
- Better Auth endpoints
- D1 data access
- Queue producers
- Queue consumers
- Durable Object entry points
- WebSocket session handling
- internal application services

## Later Shape

After the monolith is stable, introduce one additional synchronous service to learn service communication.

Candidate extracted service:
- Notification Preferences Service
- Audit Service
- Search/Index Service
- Reporting Service

This second service should remain small and purposeful.

---

## Domain Model

## Primary Entities

### User
Represents an authenticated user.

Key fields:
- id
- email
- name
- createdAt
- updatedAt

Better Auth will own its required auth/session/account tables in addition to the app’s user profile data where needed.

### Team
A logical grouping of users.

This allows:
- single-user teams initially
- future multi-user collaboration
- ownership boundaries

Key fields:
- id
- name
- createdAt
- updatedAt

### TeamMember
Membership and role mapping between users and teams.

Key fields:
- id
- teamId
- userId
- role
- createdAt

### Property
A managed location or site.

Examples:
- home
- rental
- shop
- family property

Key fields:
- id
- teamId
- title
- description
- addressText
- createdByUserId
- createdAt
- updatedAt

### Asset
A thing inside a property that can require work.

Examples:
- furnace
- water heater
- mower
- gate
- trailer
- irrigation controller

Key fields:
- id
- teamId
- propertyId
- title
- category
- manufacturer
- model
- serialNumber
- installDate
- notes
- createdAt
- updatedAt

### Task
A maintenance task or work order.

Key fields:
- id
- teamId
- propertyId
- assetId nullable
- title
- description
- status
- priority
- dueAt nullable
- assignedToUserId nullable
- createdByUserId
- createdAt
- updatedAt
- version

### Comment
User-authored comment on a task.

Key fields:
- id
- taskId
- authorUserId
- body
- createdAt
- updatedAt

### TaskEvent
Immutable audit trail for task changes.

Examples:
- task created
- status changed
- priority changed
- assigned user changed
- comment added
- due date changed

Key fields:
- id
- taskId
- actorUserId nullable
- eventType
- payloadJson
- occurredAt

### NotificationJob
Tracks queued async work related to notifications.

Key fields:
- id
- teamId
- taskId nullable
- eventType
- status
- dedupeKey
- attemptCount
- createdAt
- updatedAt

### OutboxEvent
Transactional event record produced by domain writes.

Used to safely hand off side effects to queue producers.

Key fields:
- id
- aggregateType
- aggregateId
- eventType
- payloadJson
- publishedAt nullable
- createdAt

---

## Suggested D1 Schema Notes

### Tables that likely exist

- users
- teams
- team_members
- properties
- assets
- tasks
- comments
- task_events
- notification_jobs
- outbox_events

Better Auth will add its own required tables.

### Important constraints

- unique email where applicable
- team-scoped foreign keys where appropriate
- indexes on:
  - tasks(team_id, status)
  - tasks(team_id, assigned_to_user_id)
  - tasks(team_id, due_at)
  - assets(team_id, property_id)
  - comments(task_id, created_at)
  - task_events(task_id, occurred_at)
  - outbox_events(published_at, created_at)

### Concurrency rule

Tasks should use an integer `version` field for optimistic concurrency control.

Updates should require:
- current task id
- expected version

If version mismatches, return conflict.

This is important for learning real-world update safety.

---

## Authentication and Authorization

## Authentication Choice

Use **Better Auth**.

Goals:
- avoid reinventing auth
- gain protected routes quickly
- focus time on broader backend concepts

## Initial Auth Scope

Support:

- email/password sign-up
- login
- logout
- session-based auth
- protected routes

Optional later:
- email verification
- password reset
- magic links
- social providers

## Authorization Model

Start simple.

### Roles

Use role-based access inside team membership:

- owner
- admin
- member

### Initial authorization rules

- user may only access teams they belong to
- user may only access properties/assets/tasks in their team
- only owner/admin may manage membership
- task assignment only to team members
- all domain queries are team-scoped

### Auth integration rule

The app should have a small auth/context layer that translates Better Auth session data into:

- currentUser
- currentTeam
- membership/role context

Handlers should not contain raw auth parsing logic everywhere.

---

## API Design Strategy

## Versioning

Start with:

- `/api/v1/...`

Keep auth routes separate if Better Auth expects its own conventions.

## Resource Areas

### Teams
- create team
- get current team
- list team members
- invite/add member later

### Properties
- create property
- get property
- list properties
- update property
- archive/delete property later

### Assets
- create asset
- get asset
- list assets by property
- update asset

### Tasks
- create task
- get task
- list tasks
- update task
- assign task
- change status
- change priority
- add due date

### Comments
- add comment
- list task comments

### Task Events
- list task timeline/audit trail

### Notifications
- list notifications later
- mark read later

## REST First Endpoints (Suggested)

### Teams
- `POST /api/v1/teams`
- `GET /api/v1/teams/current`
- `GET /api/v1/teams/current/members`

### Properties
- `POST /api/v1/properties`
- `GET /api/v1/properties`
- `GET /api/v1/properties/:propertyId`
- `PATCH /api/v1/properties/:propertyId`

### Assets
- `POST /api/v1/assets`
- `GET /api/v1/assets`
- `GET /api/v1/assets/:assetId`
- `PATCH /api/v1/assets/:assetId`

### Tasks
- `POST /api/v1/tasks`
- `GET /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`
- `PATCH /api/v1/tasks/:taskId`
- `POST /api/v1/tasks/:taskId/assign`
- `POST /api/v1/tasks/:taskId/status`
- `POST /api/v1/tasks/:taskId/comments`
- `GET /api/v1/tasks/:taskId/comments`
- `GET /api/v1/tasks/:taskId/events`

## API Design Rules

- validate all input with Zod
- return consistent error shape
- use cursor pagination where lists may grow
- keep filters explicit
- return conflict on optimistic concurrency mismatch
- include correlation/request id in logs and responses where useful

---

## Real-Time Architecture

## Why Real-Time Exists in This App

The real-time layer exists to teach:
- live connections
- presence
- event fan-out
- state coordination
- reconnect behavior

It is not there just to be flashy.

## Initial Real-Time Use Cases

- user opens a task detail screen
- task status changes are pushed live
- new comments are pushed live
- assignment changes are pushed live
- presence count or “users viewing task” can be shown

## Durable Object Strategy

Use one Durable Object per **task room** initially.

Alternative later:
- one DO per property room

### Responsibilities of the task room DO

- hold active WebSocket connections for that task
- track ephemeral presence
- broadcast ordered real-time events to connected clients
- optionally hold short-lived in-memory state
- optionally restore connection state on wake

### DO should not be responsible for

- primary source of truth for tasks
- long-term relational persistence
- business-rule heavy mutation logic

All durable writes should still go through the main application path and D1.

### Event flow

1. client connects to task room WebSocket
2. task update occurs through REST API
3. API writes task change to D1
4. API records task event
5. API notifies corresponding Durable Object
6. DO broadcasts update to all connected clients

This keeps D1 as source of truth and DO as coordination layer.

---

## Queue and Async Processing Architecture

## Why Queues Exist

Queues are used to learn:
- background processing
- retries
- at-least-once delivery
- idempotent consumers
- outbox/event publishing
- decoupling request path from slow side effects

## Initial Queue Use Cases

- send task assignment notification
- send task status change notification
- generate daily or weekly summary data
- update denormalized counters later
- fan out events to secondary systems later

## Outbox Pattern

Domain writes that create side effects should record an `outbox_event` in the same transaction boundary as the core write when possible.

A publisher step then emits queue messages.

This avoids the classic “DB write succeeded but async side effect publish failed” gap.

## Queue Consumer Rules

Every queue consumer must:
- accept duplicates safely
- use a dedupe key where needed
- update processing status
- log failures with enough context
- not assume exact-once delivery
- be retry-safe

---

## Synchronous Service Communication

## Why include it

You specifically want to learn synchronous service communication.

That means the project must eventually include one service boundary with a request/response dependency.

## When to add it

Not in phase 1.

Add it only after:
- REST API exists
- D1 schema is stable
- auth works
- queue flow works

## Recommended extracted service

Use a small **Reporting Service** or **Audit Query Service**.

Example:
- main API asks reporting service for computed task summary stats
- service returns dashboard aggregation
- failure handling can be explored safely

Alternative:
- Notification Preferences Service
- Search Service

## What to learn here

- timeouts
- retries
- fallback behavior
- partial failure
- correlation ids
- circuit-breaker mindset
- contract stability

---

## GraphQL Plan

## Why GraphQL is delayed

GraphQL is useful, but it is easy to misuse early.

It should only be introduced after:
- REST endpoints are stable
- frontend needs nested data efficiently
- domain shape is understood

## GraphQL Use Cases in This App

Best candidates:
- dashboard view with nested summaries
- property detail view with assets and open tasks
- task detail view with comments, assignee, and event history
- team overview page

## GraphQL Rules

- do not replace every REST endpoint immediately
- keep REST as mutation entry point at first
- use GraphQL primarily for read-heavy aggregated views
- ensure batching/data-loader style patterns to avoid N+1
- auth must be applied consistently at resolver boundaries

---

## Suggested Frontend Requirements for Learning

A minimal frontend is useful because it reveals whether the backend is actually practical.

Recommended screens:

- sign up / login
- team selection or current team bootstrap
- property list
- property detail
- asset detail
- task list
- task detail with live comments/status
- basic dashboard

The frontend can be simple. The backend learning is the priority.

---

## Repository Structure

Suggested monorepo or single repo layout:

```text
fieldops/
  apps/
    api/
      src/
        index.ts
        env.ts
        routes/
        middleware/
        modules/
        lib/
        db/
        auth/
        realtime/
        queues/
        graphql/
      migrations/
      wrangler.toml
      package.json
  packages/
    domain/
      src/
        teams/
        properties/
        assets/
        tasks/
        comments/
        notifications/
    application/
      src/
        services/
        dto/
        ports/
    data/
      src/
        d1/
        repositories/
        queries/
    contracts/
      src/
        api/
        events/
        graphql/
    shared/
      src/
        errors/
        result/
        logging/
        validation/
        ids/
  docs/
    architecture.md
    decisions/
  tests/
    e2e/
```

If that feels too heavy, collapse it.

Simpler acceptable structure:

```text
fieldops/
  src/
    routes/
    middleware/
    auth/
    db/
    modules/
      teams/
      properties/
      assets/
      tasks/
      comments/
      notifications/
    queues/
    realtime/
    graphql/
    lib/
  migrations/
  tests/
  wrangler.toml
```

The simpler version is fine at first.

---

## Internal Layering Guidance

Keep these logical layers even if they are in one repo/app.

### Transport Layer
Handles:
- Hono routes
- request parsing
- validation
- response mapping
- auth/session extraction

### Application Layer
Handles:
- use cases
- orchestration
- transactions
- authorization checks
- deciding when side effects happen

### Domain Layer
Handles:
- core business rules
- entity invariants
- status transition rules
- validation that belongs to the business itself

### Data Layer
Handles:
- D1 queries
- repository implementation
- mapping DB rows to domain/application objects

### Integration Layer
Handles:
- Better Auth integration
- queue publishing/consuming
- Durable Object communication
- external service communication

---

## Task Lifecycle Rules

Define these early so the system has real behavior.

## Statuses

Suggested:
- open
- in_progress
- blocked
- done
- canceled

## Priority

Suggested:
- low
- medium
- high
- urgent

## Invariants

- done tasks cannot be assigned new active work without reopening
- canceled tasks should not be set to in_progress without reopening
- assignment must target a valid team member
- asset must belong to same team/property scope as task
- every meaningful mutation produces a task event

---

## Real-Time Event Types

Suggested event messages sent over WebSocket:

- `task.updated`
- `task.status_changed`
- `task.assigned`
- `task.comment_added`
- `presence.updated`

Suggested envelope:

```json
{
  "type": "task.updated",
  "taskId": "tsk_123",
  "occurredAt": "2026-04-01T18:30:00.000Z",
  "payload": {}
}
```

Keep the event contract explicit and versioned if needed later.

---

## Observability Requirements

This project should be built with observability from the start.

## Logging

Use structured logs for:
- request start/end
- auth failures
- validation failures
- domain conflicts
- queue processing
- DO connection lifecycle
- external service calls

## Correlation IDs

Generate or propagate a request id on every request.

Carry it into:
- queue messages
- service-to-service requests
- durable object event forwarding logs

## Metrics to care about

At minimum, track conceptually:
- request latency
- error counts
- queue retries/failures
- WebSocket connection count
- task room connection count
- service call latency/failure rate

Even if full metrics tooling comes later, design with this in mind.

---

## Testing Strategy

## Unit Tests

Focus on:
- domain rules
- status transitions
- authorization rules
- idempotency helpers
- queue consumer decision logic

## Integration Tests

Focus on:
- route + D1 behavior
- auth-protected endpoints
- optimistic concurrency
- outbox creation
- queue publication logic

## Durable Object Tests

Focus on:
- room connection handling
- broadcast behavior
- reconnect behavior
- message ordering assumptions

## End-to-End Tests

Later, cover:
- user login
- create task
- assign task
- add comment
- see live update in second client
- queue-driven notification visible in UI or log state

---

## Delivery Phases

## Phase 0 - Foundations

Goal:
Set up project skeleton and deploy a basic Worker.

Deliverables:
- repo initialized
- Wrangler configured
- basic Hono app responding
- environment bindings set up
- lint/test/format scripts
- initial docs folder

Exit criteria:
- deployed hello-world style Worker
- local dev and deploy loop works cleanly

## Phase 1 - Authentication and Protected API Shell

Goal:
Integrate Better Auth and protect one route.

Deliverables:
- Better Auth wired into Worker
- D1 configured
- auth tables created
- signup/login/logout flow works
- current session endpoint works
- one protected `/api/v1/me` or equivalent endpoint

Exit criteria:
- user can register and log in
- protected route rejects anonymous requests
- protected route works for authenticated user

## Phase 2 - Core Relational Domain

Goal:
Build the main CRUD backbone.

Deliverables:
- teams
- properties
- assets
- tasks
- comments
- task events
- D1 migrations
- optimistic concurrency on task updates

Exit criteria:
- user can create team-scoped properties/assets/tasks
- timeline events are recorded
- comments work
- list/detail routes work

## Phase 3 - Queue-Based Side Effects

Goal:
Introduce asynchronous processing safely.

Deliverables:
- outbox_events table
- queue publisher
- queue consumer
- notification_job tracking
- task assignment/status change messages processed asynchronously

Exit criteria:
- task change creates outbox event
- queue message is produced
- consumer processes message idempotently
- retry-safe behavior is demonstrated

## Phase 4 - Real-Time Collaboration

Goal:
Add live updates and coordination.

Deliverables:
- Durable Object task room
- WebSocket connection flow
- broadcast on task changes
- live comments/status updates
- simple presence count

Exit criteria:
- two browser clients connected to same task
- one client changes task
- second client sees live update
- comments appear live

## Phase 5 - Internal Refactor for Clean Boundaries

Goal:
Tighten the codebase before adding more surface area.

Deliverables:
- use cases/application services extracted
- repositories cleaned up
- route handlers thinner
- error mapping standardized
- auth context standardized

Exit criteria:
- transport layer is not holding business logic
- code is easier to extend

## Phase 6 - Synchronous Service Communication

Goal:
Learn request/response communication across services.

Deliverables:
- one small secondary Worker service
- contract between API and service
- timeout/failure handling
- correlation id propagation

Exit criteria:
- main app calls second service
- degraded behavior is handled intentionally
- logs show traceable cross-service path

## Phase 7 - GraphQL Read Layer

Goal:
Learn GraphQL without replacing the whole app.

Deliverables:
- GraphQL Yoga integrated
- selected dashboard/property/task read queries
- batched resolvers
- auth-aware resolvers

Exit criteria:
- frontend can fetch nested views efficiently
- GraphQL is useful, not just present

## Phase 8 - Advanced Durable Orchestration (Optional)

Goal:
Add durable multi-step work if desired.

Deliverables:
- weekly summary workflow or equivalent
- long-running process state
- retry/compensation logic

Exit criteria:
- one durable multi-step process runs successfully

## Phase 9 - Traditional Backend Comparison (Optional)

Goal:
Compare one subsystem against a more conventional database backend.

Deliverables:
- one subsystem moved to Postgres via Hyperdrive or separate backend
- tradeoff notes captured in ADR/doc

Exit criteria:
- you can clearly explain what changed and why

---

## First Build Order

This is the exact practical order to start.

1. Set up Worker + Hono + Wrangler
2. Add D1 and run first migration
3. Integrate Better Auth
4. Protect a simple current-user endpoint
5. Add team bootstrap flow
6. Add property CRUD
7. Add asset CRUD
8. Add task CRUD
9. Add comments and task events
10. Add optimistic concurrency/version checks
11. Add outbox events
12. Add queue producer/consumer
13. Add notification side effects
14. Add Durable Object task room
15. Add WebSocket live updates
16. Refactor code boundaries
17. Add second service for sync comms
18. Add GraphQL read layer
19. Add optional Workflows/Postgres comparison

---

## Codex Working Rules

Use these rules when asking Codex to generate or modify code.

### 1. Prefer small, reversible changes

Ask for:
- one migration
- one endpoint
- one module
- one service
- one refactor at a time

Do not ask Codex to generate the entire app in one shot.

### 2. Require architecture consistency

When prompting Codex, specify:
- route handler should stay thin
- use Zod validation
- business logic belongs in application/domain layer
- data access belongs in repository/query layer
- no silent cross-layer shortcuts

### 3. Ask for tests with each meaningful change

Every non-trivial feature should come with:
- unit tests or
- integration tests

### 4. Preserve contracts explicitly

When adding API endpoints or event shapes, require:
- request schema
- response schema
- error cases
- example payloads

### 5. Demand idempotency for async code

Any queue consumer or event processor should be written with duplicate delivery in mind.

### 6. Capture decisions in docs

Whenever an important decision is made, create a short ADR or note under `docs/decisions`.

---

## First Milestone Spec

The first milestone should be small and real.

## Milestone 1 Goal

A user can:
- sign up
- log in
- create a team
- create a property
- create a task
- retrieve their tasks through protected REST endpoints

## Milestone 1 Minimum Deliverables

- Better Auth integrated
- D1 configured
- Hono API shell
- auth-protected routes
- team entity
- property entity
- task entity
- migrations
- validation
- basic tests

## Milestone 1 Non-Goals

Do not include yet:
- GraphQL
- queues
- Durable Objects
- WebSockets
- second service
- file uploads
- reporting
- workflows

---

## Stretch Features Later

These are valid later, not now.

- recurring maintenance schedules
- push/email digest notifications
- file/photo uploads with R2
- saved filters and dashboards
- offline client mutation queue
- task templates
- audit export/reporting
- search indexing
- SLA/escalation rules

---

## Risks and Common Mistakes

### Risk: Auth consuming the whole project
Mitigation:
Use Better Auth and keep auth requirements narrow at first.

### Risk: Premature GraphQL complexity
Mitigation:
Do REST first and defer GraphQL.

### Risk: Overusing Durable Objects
Mitigation:
Keep D1 as source of truth and use DOs only for coordination/live state.

### Risk: Broken async semantics
Mitigation:
Use outbox-style thinking and idempotent consumers.

### Risk: Accidental microservice sprawl
Mitigation:
Start as modular monolith. Add only one secondary service later.

### Risk: Route handlers becoming the whole app
Mitigation:
Keep application/domain/data separation from the start.

---

## Success Criteria

This project is successful if, by the end, you can clearly explain and demonstrate:

- how authentication integrates into a real app without hand-rolling it
- how a REST API is structured cleanly
- how relational data is modeled and evolved
- how async processing works safely
- how idempotency matters
- how real-time updates are coordinated
- when to use Durable Objects and when not to
- how synchronous service calls fail and recover
- where GraphQL actually helps
- what Cloudflare made easier
- what Cloudflare abstracted away compared to a traditional backend

---

## Final Recommendation

Build this project on Cloudflare.

Do not avoid the platform just because it differs from conventional Node/Express/Postgres/Kafka systems.

The differences are real, but they are still valuable backend lessons. The key is to build with discipline:

- modular monolith first
- Better Auth instead of homemade auth
- REST before GraphQL
- D1 as source of truth
- Queues for async work
- Durable Objects for coordination only
- WebSockets for real-time learning
- one secondary service later for sync communication
- compare with traditional infrastructure only after the core app works

That path will teach useful backend engineering without drowning in infrastructure.
