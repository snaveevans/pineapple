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

## User Profile & Onboarding

**Route:** `/onboarding` (post-auth guard on `/app/*`); profile editing at `/app/profile` (avatar in top bar)
**Goal:** Require authenticated users to confirm or enter a display name before showing the authenticated app, then let them update that name later.

**Key states:**

- Loading: after authentication, fetch `GET /api/users/me` before rendering authenticated routes
- Incomplete onboarding with provider name: prefill the name field and require explicit confirmation
- Incomplete onboarding without provider name: show an empty required name field
- Saving: disable duplicate submits while `PATCH /api/users/me` is in flight
- Complete: enter the originally requested authenticated route, or `/app` by default
- Later profile edit: read and update the same domain profile name
- Later profile edit: add, change, remove, and resend verification for the contact email used for maintenance reminders
- Contact email unset: show an empty optional email field with a save action
- Contact email unverified: show the saved address, an unverified badge, and a resend-verification action
- Contact email verified: show a verified badge and reminder-delivery confirmation copy

**Non-obvious behavior:**

- Email identifies the account but is never displayed as, or transformed into, the user's name
- The contact email is separate from the Google sign-in email; reminders are delivered only after that contact address is verified
- Provider session data can seed the first value, but later provider sign-ins must not overwrite the Pineapple profile name
- The route guard is a UX control only; the API deliberately remains accessible to authenticated users with incomplete onboarding for now
- A future multi-client or security requirement may require API middleware that limits incomplete users to auth and self-profile endpoints
- The dashboard greeting and profile avatar initial use the saved domain profile name, not provider session data or email

**Spec:** [`docs/specs/features/user-profile.md`](../specs/features/user-profile.md)

---

## Authenticated App Shell

**Route:** `/app/*`
**Goal:** Give authenticated users consistent access to the main app destinations and account-level controls from every app screen.

**Key states:**

- Desktop: top bar shows the FieldOps brand, route tabs for Home, Assets, and History, plus search, notifications, and profile controls
- Mobile: bottom tab bar shows the same Home, Assets, and History destinations
- Active route: the matching tab is highlighted for the current page

**Non-obvious behavior:**

- The shell exposes only destinations with implemented routes; there is no disabled Schedule placeholder tab
- Scheduled maintenance workflows remain available from Dashboard and asset maintenance screens until a dedicated Schedule route is specified and built

---

## Dashboard (Home)

**Route:** `/app`
**Goal:** Give the authenticated user an at-a-glance view of upcoming and overdue service across their fleet, with a master/detail layout for acting on the next item.

**Key states:**

- Loading: fetches `GET /api/dashboard` before rendering fleet stats and queue
- Empty fleet: prompts the user to add their first asset
- Assets without scheduled tasks: fleet totals render; queue empty state points to the asset library
- Populated: urgency-sorted maintenance queue with overdue/soon/on-track status from the API
- Detail card (desktop) or inline expand (mobile) for the selected queue item
- Filtered empty: category filter active but no matching queue rows
- Error: dashboard-level error with retry
- Mark complete: creates a linked maintenance record for the selected task and refetches dashboard + asset maintenance data
- Add service: drawer modal to create a recurring maintenance task for any asset; defaults to the currently selected queue item's asset when one is selected

**Non-obvious behavior:**

- Initial render uses one dashboard read model — no fan-out across assets and per-asset task endpoints
- Status buckets and fleet health counts come from the API; the client formats due-date copy only
- Category filter chips filter the returned queue client-side without a new request
- Add service fetches the asset list on demand when opened; task creation reuses the same validation and API contract as the asset maintenance task form
- Reschedule and Snooze remain disabled placeholders until future specs land
- Task detail fields not yet in the maintenance-task API (estimated time, location, assignee, notes) are not shown from live data
- 401 from the API redirects to `/login`

**Spec:** [`docs/specs/features/dashboard.md`](../specs/features/dashboard.md)

---

## Asset Library

**Route:** `/app/assets`
**Goal:** Let the user browse all their assets, narrow the list by category, and navigate to any asset's maintenance history.

**Key states:**

- Loading: loading state while fetching; toolbar controls hidden
- Empty (no assets owned): prompt to add first asset with a direct link to the add form; no toolbar shown
- Populated: grid view (desktop default) or list/row view; category chips and view toggle shown; each card links to `/app/assets/:id/maintenance`
- Filtered: a category chip is active; the loaded list is narrowed to that asset type
- Filtered empty: the selected category has no matching assets (library is otherwise non-empty); message names the category with a way to clear the filter or add an asset
- Error: inline error message with a "Try again" retry button

**Non-obvious behavior:**

- There is **no inline search box** on this screen — finding a specific asset is handled by global [App Search](#app-search) (`cmd/ctrl+K` or the top-bar button)
- Category filter chips show **per-category counts that come from the API**; selecting a chip filters the **already-loaded** list **client-side** with no refetch — the same pattern as the Dashboard queue filter. The selected category is ephemeral client state and is never sent to the API
- A category chip with a count of `0` still renders and is selectable (leads to the filtered-empty state)
- Grid/list view toggle appears only on wider/desktop viewports, defaults to grid, and the choice **persists across visits in the same browser**; mobile always uses the row list and hides the toggle
- The header count copy is grammatically correct: "1 thing you take care of" vs. "N things you take care of"
- Toolbar controls (chips + view toggle) appear only once the list has loaded with at least one asset; there are no disabled/placeholder controls
- 401 response redirects to `/login` without retrying

**Spec:** [`docs/specs/features/asset-library.md`](../specs/features/asset-library.md)

---

## App Search

**Route:** global app-shell affordance (no dedicated route required); available across `/app/*`
**Goal:** Let the user jump straight to one of their assets from anywhere in the authenticated app, instead of navigating to the library and scanning.

**Entry points:**

- Desktop top-bar search button
- **`cmd+k` keyboard shortcut on macOS opens search**; `ctrl+k` does the same on non-macOS keyboards
- Mobile top-bar search button opens a full-screen search sheet

**Key states:**

- Closed/idle: not shown
- Typing: debounced; loading indicator while the request is in flight
- Results: ranked list from `GET /api/search?q=…` — each row shows name, type, and a summary line; selecting a result navigates to that asset's maintenance page (`/app/assets/:id/maintenance`)
- No matches: clear "no matches" empty state (a 200 with an empty array, not an error)
- Error: retryable error state
- Unauthenticated (401): redirect to `/login`

**Non-obvious behavior:**

- The client debounces input and **suppresses the API call until there is ≥1 non-space character** — the API's 422 on an empty query is a safety net, not the normal path
- Results arrive **pre-ranked and pre-summarized** from the API; the client renders them and does not recompute ordering or the summary line (ADR-0009)
- `cmd+k` is intercepted globally and must not collide with the browser's own shortcuts
- Desktop presentation is a command palette overlay; mobile presentation is a full-screen sheet
- App Search is the **only** asset-search affordance — the Asset Library has no inline search box; its toolbar is for category filtering and grid/list view only

**Spec:** [`docs/specs/features/app-search.md`](../specs/features/app-search.md)

---

## Activity History

**Route:** `/app/history`
**Goal:** Let the user review a durable, cross-asset timeline of actions they have taken across their fleet.

**Key states:**

- Loading: fetches `GET /api/activity` before rendering the feed
- Empty account history: explains that future asset, maintenance, and task actions will appear
- Populated: reverse-chronological timeline grouped by action day, with an all-time activity breakdown rail; each entry shows action type, title/name, asset snapshot, relative time, and absolute time
- Filtered: type chips and a single asset selector refetch the server-side filtered feed
- Search: inline search narrows the currently loaded history entries by title or asset name only; it does not query the API or search unloaded pages
- Filtered empty: active filters/search remain visible and can be cleared
- Pagination: "Load older" requests the next cursor while preserving active filters
- Error: feed-level retry state

**Non-obvious behavior:**

- The first API page returns the activity page, available filters, counts, and cursor in one read model; cursor pages preserve those first-page filters while loading older entries
- The client does not filter a preloaded history locally for type or asset filters
- The History search field is intentionally labeled as loaded-history search and only narrows fetched pages client-side
- Filter counts come from the caller's complete history, not the current filtered view
- Deleted tasks and archived/renamed assets still render from the event snapshot
- Completing a scheduled task by logging work appears as one `task_completed` row, not as both completed and logged rows
- 401 response redirects to `/login`

**Spec:** [`docs/specs/features/activity-history.md`](../specs/features/activity-history.md)

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
