# Features

> **Audience:** product & marketing · **Purpose:** what Pineapple can do today,
> framed by the value it delivers · **Source of truth:** this file ·
> **Last reviewed:** 2026-05-29

Pineapple helps a small team keep track of their **assets** — the vehicles,
properties, and equipment they operate — in one place. This page lists what
ships **today**. For what's next, see the [roadmap](roadmap.md).

> **Status legend:** ✅ available · 🟡 partial (data modeled, not yet exposed)

## Capabilities

### ✅ Sign in with Google

One-tap sign-in with a Google account — no passwords to create or remember.
Accounts are created automatically on first sign-in. _Benefit: zero-friction
onboarding; nothing to manage._

### ✅ Track three kinds of assets

Add and view **vehicles**, **properties**, and **equipment**, each with details
that fit the kind:

- **Vehicles** — make, model, year, and (optionally) VIN.
- **Properties** — a full address plus an optional nickname.
- **Equipment** — manufacturer, model number, and serial number.

_Benefit: the right fields for each asset type, instead of a one-size-fits-all
form._

### ✅ Private by owner

Each person sees only their own assets. There's no accidental cross-visibility.
_Benefit: personal inventories stay personal._

### ✅ API-first, fully documented

Every capability is a clean HTTP API with an always-current, interactive spec
(OpenAPI / Scalar). _Benefit: a UI, a mobile app, or an automation can be built
against it immediately, and the docs never lie._

### 🟡 Archiving

Assets carry an "archived" state, and active-only listing already excludes
archived items — but there's no button to archive yet. _Coming via an update
endpoint (see roadmap)._

## What it's for

The north star is **field operations**: not just an inventory, but a record of
the work done around each asset over time. Today's release nails the foundation
— a trustworthy, private, typed asset registry with an open API. The work log,
attachments, and a UI build on top of it.

## Not yet available

To set expectations honestly, these are **not** in today's build (they're on the
[roadmap](roadmap.md)): a web/mobile UI, editing or deleting assets, search and
filtering, photos/attachments, work/maintenance logs, sharing between users, and
notifications.
