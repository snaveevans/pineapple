# Roadmap

> **Audience:** product · **Purpose:** gaps and opportunities, roughly ordered ·
> **Source of truth:** this file for roadmap direction; feature behavior lives in `docs/specs/` · **Last reviewed:** 2026-06-03

Direction, not commitment. Reflects where the product can grow from the current
feature specs. Order is a rough priority, not a schedule.

## Near term — complete the core loop

- **Finish the web UI.** The asset registry screens exist, while the dashboard
  and marketing page are still work in progress. Bring the WIP specs to active
  requirements before treating those screens as complete.
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
any supporting design, API work, or feature spec. Use
[`docs/specs/SPECS.md`](../specs/SPECS.md) to check what already exists before
proposing.
