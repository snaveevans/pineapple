# Web App Features

Intent ledger for `apps/web`. Each entry captures the user goal, key states, and
non-obvious edge cases — not component structure or visual design. Update this file
when adding a screen, changing a flow, or removing a feature.

For the API contract behind each feature, see the linked spec in `docs/specs/features/`.

---

## Marketing Home

**Route:** `/`
**Goal:** Communicate the product's value to prospective users and route them to sign-up or login.

**Key states:**

- Default (unauthenticated / session check in flight): full nav and hero CTAs for sign-up and login
- Authenticated: all login-destined CTAs swap to a single "Go to App" button (→ `/app`); footer login link is removed
- Session check failure (network error, 4xx/5xx): silently falls back to unauthenticated state — no error shown

**Non-obvious behavior:**

- The unauthenticated button set renders immediately on load (no spinner/placeholder), so there's no layout shift in the common case
- Authenticated users are not redirected away — they may intentionally visit the marketing page

**Spec:** [`docs/specs/features/marketing-home.md`](../specs/features/marketing-home.md)

---

## Sign In

**Route:** `/login`
**Goal:** Let the user authenticate via Google OAuth and land in the app.

**Key states:**

- Default: Google sign-in button
- In-flight: button disabled while OAuth redirect is pending
- Error: auth failure surfaces an error message inline

**Non-obvious behavior:**

- Supports `?mode=signup` and `?mode=login` query params; both go through the same Google OAuth flow — the distinction is cosmetic copy only
- On success, redirects to `/app`

**Spec:** [`docs/specs/features/sign-in.md`](../specs/features/sign-in.md)

---

## Dashboard (Home)

**Route:** `/app`
**Goal:** Give the authenticated user an at-a-glance view of upcoming and overdue service across their fleet, with a master/detail layout for acting on the next item.

**Key states:**

- Urgency-sorted queue of assets with overdue/soon/ok status indicators
- Detail card (desktop) or inline expand (mobile) for the selected queue item
- Actions on the detail: Mark complete, Reschedule, Snooze (UI present; not yet wired to API)

**Non-obvious behavior:**

- Currently renders hardcoded prototype data — not yet connected to the live API
- Category filter chips and "Add service" button are present in the UI but not yet functional
- 401 from the API (when wired) should redirect to `/login`

---

## Asset Library

**Route:** `/app/assets`
**Goal:** Let the user see all their assets and navigate to any asset's maintenance history.

**Key states:**

- Loading: skeleton/loading state while fetching
- Empty: prompt to add first asset with a direct link to the add form
- Populated: grid view (default) and row view; each card links to `/app/assets/:id/maintenance`
- Error: inline error message with a "Try again" retry button

**Non-obvious behavior:**

- Search input and category filter chips render but are disabled (not yet implemented)
- View toggle (grid/list) renders but is disabled
- 401 response redirects to `/login` without retrying

---

## Add Asset

**Route:** `/app/assets/new`
**Goal:** Let the user register a new asset (vehicle, equipment, or property) with a name, type, and optional notes.

**Key states:**

- Idle: blank form
- Validation error: inline field errors on submit with focus moved to the first invalid field
- Submitting: form disabled while the API call is in flight
- Success: redirects to `/app/assets` and invalidates the assets query cache
- API error: inline error message; form re-enabled for correction

**Non-obvious behavior:**

- 401 on submit redirects to `/login`
- Client-side validation runs before the API call; field errors map from the API's 422 response if server validation also fails

**Spec:** [`docs/specs/features/create-asset.md`](../specs/features/create-asset.md)

---

## Asset Maintenance Records & Tasks

**Route:** `/app/assets/:id/maintenance`
**Goal:** Let the user view and log maintenance history for a specific asset, and manage upcoming maintenance tasks for it.

**Key states:**

- Loading: fetching asset, records, and tasks in parallel
- Asset not found / 403: redirect to `/app/assets`
- Empty records: prompt to log first record
- Empty tasks: prompt to add first task
- Populated: chronological list of records; task list with overdue/upcoming indicators
- Create record form: inline or modal; validates date and description; submits to API
- Create task form: inline; validates title and due date
- Delete task: confirmation before removal

**Non-obvious behavior:**

- Records and tasks are fetched independently; one can load before the other
- Dates are stored as ISO strings (YYYY-MM-DD) and displayed as human-readable relative dates ("3 days ago", "yesterday")
- 401 on any fetch redirects to `/login`

**Spec:** [`docs/specs/features/maintenance-record.md`](../specs/features/maintenance-record.md), [`docs/specs/features/maintenance-task.md`](../specs/features/maintenance-task.md)
