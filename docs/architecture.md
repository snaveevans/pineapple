# Architecture

## Current Shape

FieldOps starts as a single deployable Worker application under `apps/api`. The repository is workspace-ready so a separate frontend can be introduced later without forcing a repo reorganization.

## Why the Workspace Exists Now

The backend is the only active app in Phase 0, but the workspace layout leaves intentional room for:

- `apps/web` as a future Cloudflare-hosted UI
- `packages` for shared contracts and utilities once more than one app needs them

This keeps the current implementation lean while avoiding a disruptive restructure later.

## Boundary Rules

- `apps/api` is the only deployable application in Phase 0.
- `apps/web` stays empty except for documentation until the UI work begins.
- `packages` stays empty except for documentation until there is a real shared consumer.
- No Cloudflare platform bindings are added before their corresponding phase starts.
