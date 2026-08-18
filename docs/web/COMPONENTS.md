# Web Component Intent

> **Audience:** frontend engineers · AI agents implementing web slices ·
> **Purpose:** which shared primitive represents which domain concept, and
> which lookalike to reach for instead · **Source of truth:** this file
> (hand-written; mirrors `apps/web/src/design/`) · **Last reviewed:** 2026-08-17

`apps/web/src/design/` holds the app's shared visual vocabulary. This file is
the intent ledger for it — the UI twin of
[ADR-0009](../decisions/0009-computed-fields-belong-in-api-read-models.md).
ADR-0009 says the API names the domain concept behind a value instead of
handing clients a bare field to reinterpret; this file does the same for
components. Each entry below names the domain concept a primitive represents,
not just its appearance, so a visually-similar screen can't quietly borrow it
for a different meaning.

**Prop shapes are not restated here.** The TypeScript types in each file are
the source of truth for shape; this file is the source of truth for meaning.
If an entry's prop list drifts from the code, trust the code and fix this file.

## The rule

**A screen composing existing primitives is a normal slice. A screen that
needs a new primitive is a design-system change and gets its own branch.**

Reaching for the visually-closest existing component because it's already
imported is exactly the failure mode this file exists to prevent — a status
pill is not a badge is not a chip because they render as similarly-shaped
rounded-pill `<span>`s. If a screen's design doesn't fit any entry below,
that's a signal to extend `design/`, not to bend an existing primitive's
meaning. Extending the library is its own branch: it changes shared surface
area other screens depend on, so it needs the same scrutiny #149 gave the
original extraction, not the review budget of a one-screen feature slice.

## Primitives

### `Icon` — `design/Icon.tsx`

- **Represents:** the app's inline UI icon vocabulary. Stroke-only glyphs
  (lucide-style); never a filled shape.
- **Props:** `name` (closed `IconName` union), `size`, `stroke`, `color`.
- **States:** none — a single glyph selected by name.
- **Use for:** any inline interface icon — nav, inline actions, field hints,
  status decoration inside another primitive.
- **Don't use for:** brand identity → use `Brandmark`. Don't add a filled icon
  to `Icon`'s set to stand in for the logo; that breaks the stroke-only
  invariant every other icon depends on.

### `Brandmark` — `design/Brandmark.tsx`

- **Represents:** the FieldOps brand glyph (the filled hex-nut) — brand
  identity, not interface chrome.
- **Props:** `size`, `color`.
- **States:** none — a static filled glyph.
- **Use for:** logo lockups in header/auth/marketing chrome.
- **Don't use for:** anything that isn't the literal brand mark → use `Icon`.
  Never draw the nut shape as a one-off `Icon` entry.

### `HFStatusPill` — `design/hf.tsx`

- **Represents:** the API-computed service status of an asset or task —
  `overdue` / `soon` / `ok` (the field ADR-0009 puts in the read model).
- **Props:** `status` (`AssetStatus`), `due` (optional label override).
- **States:** three tones — bad (overdue), warn (soon), ok — each with its own
  icon and default label.
- **Use for:** rendering that specific computed status field, wherever the API
  returns it.
- **Don't use for:** ownership/sharing state. Whether an asset is owned or
  shared is a different domain concept from its service status, even though
  both render as small pills — see `sharingPresentation.ts`'s `SharingBadge`
  and its renderer (currently local to `AppAssets.tsx`). Never repoint
  `HFStatusPill`'s color/icon config at a non-status value; that silently
  couples an unrelated concept to status semantics.

### `HFAssetIcon` — `design/hf.tsx`

- **Represents:** an asset's category (vehicle/equipment/property/lawn), as a
  small tinted icon tile.
- **Props:** `asset` (`{ category, icon }`), `size`.
- **States:** four category tints; no status.
- **Use for:** compact category identification — list rows, inline
  references, anywhere an asset is named in passing.
- **Don't use for:** a card-level asset preview that also needs to show live
  status → use `HFAssetThumb`.

### `HFAssetThumb` — `design/hf.tsx`

- **Represents:** an asset's card-level identity: category art plus an
  optional live-status indicator.
- **Props:** `asset` (`{ cat, icon, status? }`), `height`.
- **States:** category badge always present; status dot only when `status` is
  passed.
- **Use for:** asset grid/list cards where both category and status matter.
- **Don't use for:** small inline icon contexts (nav, table cells) → use
  `HFAssetIcon`; it's not a scaled-down thumb, it's a different primitive.

### `Button` — `design/Button.tsx`

- **Represents:** a user-triggered action — click, navigate, or submit. Never
  a status or state indicator.
- **Props:** `variant` (`default` / `primary` / `secondary` / `ghost` /
  `brand` — pick by the action's weight in the screen, not by color mood),
  `size`, `loading`, plus `to`/`href` to render as a link/anchor instead of a
  `<button>`.
- **States:** default, disabled, loading (spinner replaces the label
  affordance; the element stays inert).
- **Use for:** every clickable action in the app — form submit, navigation,
  destructive or secondary actions.
- **Don't use for:** a non-interactive label or status → use `HFStatusPill` or
  plain text. A row of related buttons is a `Toolbar`, not ad hoc flex CSS
  around several `Button`s.

### `Card` — `design/Card.tsx`

- **Represents:** a bordered, elevated content surface used to group related
  content. No domain meaning beyond "this is one visually distinct group" —
  it carries no status, action, or identity semantics of its own.
- **Props:** `children`, `className` (for interior layout only).
- **States:** none — a static surface wrapper.
- **Use for:** wrapping a block of content that needs visual separation from
  the page background (bordered/shadowed container).
- **Don't use for:** the content structure inside the group — `Card` supplies
  the surface only; page-specific interior layout stays local CSS. Don't
  re-declare a second bordered-surface class for a screen that just needs a
  `Card`.

### `EmptyState` (+ `EmptyStateActions`) — `design/EmptyState.tsx`

- **Represents:** "there is nothing to show for this read" — covers the
  `loading`, `empty`, and `error` states from
  [`loading-states.md`](../specs/cross-cutting/loading-states.md) when a read
  has no rows to render, framed as one message.
- **Props:** `icon`/`spinner`, `title`, `description`, `action`/`children`,
  `surface` (the layout variant matched to the screen it replaced — pick the
  existing surface closest to the new screen rather than adding one; adding a
  new `surface` value is a design-system change under the rule above).
- **States:** icon-or-spinner, title, optional description, optional action
  row (via `EmptyStateActions`).
- **Use for:** any list/detail screen with zero rows, a load error, or a
  pending initial load rendered as a placeholder.
- **Don't use for:** a transient inline validation message on a single field
  → use `Field`'s `error`.

### `Field` (+ `FieldRow`, `FieldReqMark`) — `design/Field.tsx`

- **Represents:** one labeled form input, including its required/optional
  marker, hint text, and validation error.
- **Props:** `label`, `required`/`optional`, `hint`, `error`, `sub`,
  `children` (the input itself). `FieldRow` groups fields horizontally;
  `FieldReqMark` is the bare `*` for a label that composes required-ness
  outside a full `Field`.
- **States:** default, error (error styling + `role="alert"` message,
  replacing `sub`/`hint`).
- **Use for:** wrapping any editable form input that needs a label, hint, or
  inline validation error.
- **Don't use for:** static key/value display on a read-only detail screen →
  use plain markup. `Field` implies an editable input; using it for read-only
  data misrepresents the screen as a form.

### `Toolbar` — `design/Toolbar.tsx`

- **Represents:** a horizontal row of section-level controls, with an
  optional right-aligned `end` group.
- **Props:** `children` (leading controls), `end` (trailing group).
- **States:** none — layout-only.
- **Use for:** grouping page/section controls — filters, view toggles,
  primary actions — in one row at the top of a section.
- **Don't use for:** a single button (just render the `Button`) or a form
  field row (use `FieldRow`) — `Toolbar` is for section-level control
  clusters, not any horizontal flex layout.
