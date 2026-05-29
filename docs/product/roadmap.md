# Roadmap

> **Audience:** product · **Purpose:** gaps and opportunities, roughly ordered ·
> **Source of truth:** this file · **Last reviewed:** 2026-05-29

Direction, not commitment. Reflects where the product can grow from today's
[feature set](features.md). Order is a rough priority, not a schedule.

## Near term — complete the core loop

- **Web UI.** The biggest gap: everything today is API-only. A front end (likely
  Cloudflare Pages, referencing the existing high-fidelity designs) turns the API
  into a usable product.
- **Edit, archive, delete assets.** The data model already supports archiving;
  expose `PATCH`/archive/`DELETE` endpoints and wire the UI to them.
- **Search & filter.** Filter assets by type, and search by name/details, as
  inventories grow.

## Mid term — the "operations" in field operations

- **Work / maintenance log.** A timeline of work done on each asset (services,
  repairs, inspections) — the core differentiator beyond a static registry.
- **Photos & attachments.** Per-asset images and documents (e.g. titles,
  receipts) stored in Cloudflare R2.
- **Reminders & notifications.** Service-due and inspection reminders (e.g.
  registration renewal, maintenance intervals).

## Longer term — collaboration & insight

- **Sharing.** Let team members share or co-manage specific assets, with
  appropriate permissions (today everything is strictly per-owner).
- **Reporting.** Summaries across assets — costs over time, upcoming work,
  fleet/property overviews.
- **Import/export.** Bulk-load existing inventories and export records.

## How to propose a change

For a significant, hard-to-reverse technical choice, write an
[ADR](../decisions/README.md). For product/feature ideas, add them here and link
any supporting design or API work. Use the [feature list](features.md) to check
what already exists before proposing.
