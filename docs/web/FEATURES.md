# Web App Features

Intent ledger for `apps/web`. Each entry captures the user goal, key states, and
non-obvious edge cases — not component structure or visual design. Update this file
when adding a screen, changing a flow, or removing a feature.

For the API contract behind each feature, see the linked spec in `docs/specs/features/`.

Each entry lists its renderable states using the vocabulary from
[`docs/specs/cross-cutting/loading-states.md`](../specs/cross-cutting/loading-states.md):
`loading`, `error`, `empty`, `populated` for reads; `pending` and `error` for
mutations. Content-stress states (long strings, pagination boundaries) and
documented exceptions are noted per entry. These state lists are the input the
state gallery (#145) enumerates from — every state listed here must be
renderable in isolation. Navigate-away transitions (e.g. onboarding complete,
create-asset success) are noted as transitions, not listed as enumerable
states. Non-vocab state names — `unauthorized` (401 "Redirecting to sign in"
UI), plain-prose layout states (e.g. "Desktop", "Closed", "Idle, vehicle
type"), and local UI states (e.g. "form", "delete-task confirm") — are written
plainly or carry an **Exceptions** note; they are never wrapped in backticks
like vocabulary tokens.

**Gallery exclusions.** The full-app gallery harness (#145 / #191) photographs
each state through a single `page.route` seam. A state whose product code
navigates away within the same tick after the intermediate paints — specifically
a distinct `unauthorized` UI that `navigate`s to `/login` on 401 — cannot be
stably captured on that seam, because React Router replaces the tree in memory
before the shot lands (#191). Those states remain renderable in isolation (and
are covered by interaction tests); they are excluded from the gallery only.
Mark them with `[gallery:excluded #N]` **after the em-dash** on the state
bullet (state IDs derive from the text before `—`; the marker must not enter
that substring). Do not mark `error` bullets that only note "401 redirects to
`/login`" as a side effect of an otherwise stable error UI, and do not change
shipped navigate timing to make a transient photographable. `excluded` is a
decision, not a promise; a future `deferred` marker would mean "gallery later."

---

## Marketing Home

**Route:** `/`
**Goal:** Communicate the product's value to prospective users and route them to sign-up or login.

**States:**

- Unauthenticated — full nav and hero CTAs for sign-up and login
- Authenticated — all login-destined CTAs swap to a single "Go to App" button (→ `/app`); footer login link removed

**Exceptions:** Uses a boolean `useSession()` hook that defaults to unauthenticated (`false`) until the session endpoint proves otherwise — not React Query, and not the three-value session machine in `AuthFlow.tsx`. Any fetch failure is treated as unauthenticated; there is no error state. The unauthenticated button set renders immediately (no spinner), so there's no layout shift in the common case.

**Non-obvious behavior:**

- Authenticated users are not redirected away — they may intentionally visit the marketing page

**Spec:** [`docs/specs/features/marketing-home.md`](../specs/features/marketing-home.md)

---

## Sign In

**Route:** `/login`
**Goal:** Let the user authenticate via Google OAuth and land in the app.

**States:**

- Idle — Google sign-in button
- In-flight — button disabled while OAuth redirect is pending
- Error — auth failure surfaces an error message inline

**Exceptions:** Uses the OAuth redirect flow, not React Query — part of the auth-flow exception in `loading-states.md`. The "in-flight" state is the OAuth redirect, not a `useMutation` `isPending`.

**Non-obvious behavior:**

- Supports `?mode=signup` and `?mode=login` query params; both go through the same Google OAuth flow — the distinction is cosmetic copy only
- On success, redirects to `/app`

**Spec:** [`docs/specs/features/sign-in.md`](../specs/features/sign-in.md)

---

## User Profile & Onboarding

**Route:** `/onboarding` (post-auth guard on `/app/*`); profile editing at `/app/profile` (avatar in top bar)
**Goal:** Require authenticated users to confirm or enter a display name before showing the authenticated app, then let them update that name later.

**States:**

- `loading` — fetch `GET /api/users/me` before rendering authenticated routes
- `error` — retryable error; 401 redirects to `/login`
- `populated` (incomplete onboarding, provider name available) — name field prefilled; explicit confirmation required
- `populated` (incomplete onboarding, no provider name) — empty required name field
- `populated` (profile edit) — saved display name and contact-email state rendered for editing

Onboarding "complete" is a navigate-away transition (effect fires `navigate(returnTo)`), not a stable screen — not enumerable for the gallery.

**Contact-email value sub-states:** unset (empty optional field with save action) · unverified (saved address, unverified badge, resend-verification action) · verified (verified badge, reminder-delivery confirmation copy)

**Mutations:**

- `pending` (`PATCH /api/users/me`, display name) — duplicate submits disabled while in flight
- `pending` (set contact email, `PUT /api/users/me/notification-email`) — submit disabled while in flight
- `pending` (remove contact email, `DELETE /api/users/me/notification-email`) — action disabled while in flight
- `pending` (resend verification, `POST /api/users/me/notification-email/verification`) — resend disabled while in flight; also disabled during cooldown
- `error` — inline field errors; 422 field errors mapped to individual inputs; 401 redirects to `/login`

**Notice states (local UI, not async):** saved ("This address is verified; reminders will be sent here.") · verification-sent ("Verification email sent to {address}; check your inbox.") · removed ("Contact email removed. Maintenance reminders will not be sent until you add one.") · cooldown ("You can request another verification email in a few minutes." — triggered by 429, disables resend)

**Content stress:** maximum-length display name (100 characters); long contact email address

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

**States:**

- Desktop — top bar shows the FieldOps brand, route tabs for Home, Assets, and History, plus search, a live notifications badge/link, and profile controls
- Mobile — `[gallery:excluded #199]` bottom tab bar shows the same destinations; dual-viewport harness already photographs Desktop at mobile size
- Active route — the matching tab is highlighted for the current page

**Own async states (in `HFTopBar`):**

- `loading` (profile) — `[gallery:excluded #199]` avatar `?` until me resolves; unreachable on cold load — OnboardingGuard blocks the shell
- `populated` (profile) — avatar renders the first character of the display name, uppercased; tooltip is the display name
- `error` (profile) — `[gallery:excluded #199]` avatar stays on `?`; unreachable on cold load — guard never mounts the shell
- `loading` (notifications) — `[gallery:excluded #199]` badge absent while pending; pixel-identical to zero-unread
- `populated` (notifications, zero unread) — badge hidden
- `populated` (notifications, has unread) — badge shows unread count
- `error` (notifications) — `[gallery:excluded #199]` badge degrades to hidden; pixel-identical to zero-unread

**Exceptions:** The shell owns two `useQuery` calls (`getUserProfile` and `listNotifications({ limit: 1 })`). Profile loading/error never paint on a mounted shell: OnboardingGuard shares `userProfileQueryKey` and refuses `<Outlet />` until me has data (#199). Notifications loading/error hide the badge the same way zero-unread does (#199). The notifications badge query uses a separate key (`notificationsPageQueryKey({ limit: 1 })`) from the Notifications page.

**Non-obvious behavior:**

- The notifications control links to `/app/notifications`; its badge is driven by the API unread count and hides when there are no unread notifications
- The shell exposes only destinations with implemented routes; there is no disabled Schedule placeholder tab
- Scheduled maintenance workflows remain available from Dashboard and asset maintenance screens until a dedicated Schedule route is specified and built

---

## Notifications

**Route:** `/app/notifications`
**Goal:** Let the authenticated user review due-soon maintenance reminders and clear unread items.

**States:**

- `loading` — fetches `GET /api/notifications`; shows row skeletons
- `error` — retryable load error
- `unauthorized` (401) — `[gallery:excluded #195]` lock icon, "Redirecting to sign in" / "Your session is no longer active." then navigates to `/login`
- `empty` — "You're all caught up" / "Maintenance reminders will show up here as tasks come due on your assets." CTA: none (passive)
- `populated` — newest-first notification list with unread marker, asset icon, task title, due copy, asset name, reminder date, and relative created time
- `populated` (paginated) — "Load older notifications" requests the next cursor when available

**Mutations:**

- `pending` (mark one read) — clicking an unread row calls `POST /api/notifications/{notificationId}/read`
- `pending` (mark all read) — header action calls `POST /api/notifications/read-all`; disabled when nothing is unread
- `error` — mutation errors surface above the list

**Content stress:** long asset name in notification rows; long task title; collection at pagination boundary

**Non-obvious behavior:**

- The list renders only the self-contained notification snapshots returned by the API; it does not look up live asset or task records
- The unread badge in the app shell and the inbox share the same notifications query family, so mark-read actions invalidate both views
- Due copy is display formatting only; the reminder creation policy and unread count come from the API
- Deleted tasks and renamed/archived assets can still render from their notification snapshots

**Spec:** [`docs/specs/features/notifications.md`](../specs/features/notifications.md)

---

## Dashboard (Home)

**Route:** `/app`
**Goal:** Give the authenticated user an at-a-glance view of upcoming and overdue service across their fleet, with a master/detail layout for acting on the next item.

**States:**

- `loading` — fetches `GET /api/dashboard` before rendering fleet stats and queue
- `error` — dashboard-level error with retry; 401 redirects to `/login`
- `empty` (empty fleet) — prompts the user to add their first asset. CTA: link to add-asset form
- `empty` (no scheduled tasks) — fleet totals render; queue empty state points to the asset library. CTA: link to asset library
- `empty` (filtered) — category filter active but no matching queue rows. CTA: clear filter
- `populated` — urgency-sorted maintenance queue with overdue/soon/on-track status from the API; detail card (desktop) or inline expand (mobile) for the selected queue item; sharing indicators on queue rows and selected detail ("Shared with team" / "Shared by {owner}" / none)

**Mutations:**

- `pending` (mark complete) — creates a linked maintenance record for the selected task and refetches dashboard + asset maintenance data
- `pending` (add service) — drawer modal creates a recurring maintenance task for any asset; defaults to the currently selected queue item's asset when one is selected
- `error` — inline error; mutation errors surface in the active modal/drawer

**Add-service drawer nested states** (fetches asset list on demand when opened):

- `loading` — "Loading assets" / "Fetching your fleet so you can choose where to schedule this service…"
- `error` — "Assets could not be loaded" / error message, with "Try again" retry
- `empty` — "No assets available" / "Add an asset before scheduling a service." CTA: "Add asset" link to `/app/assets/new`

**Content stress:** long asset name in queue rows and detail card; long task title; long owner display name in sharing badge

**Non-obvious behavior:**

- Initial render uses one dashboard read model — no fan-out across assets and per-asset task endpoints
- Status buckets and fleet health counts come from the API; the client formats due-date copy only
- Sharing badge copy is driven by each queue item's API `sharing` descriptor; the client does not re-derive ownership
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

**States:**

- `loading` — loading state while fetching; toolbar controls hidden
- `error` — inline error message with a "Try again" retry button
- `unauthorized` (401) — `[gallery:excluded #195]` spinner + "Redirecting to sign in" then navigates to `/login`
- `empty` (no assets owned) — prompt to add first asset with a direct link to the add form; no toolbar shown. CTA: link to add-asset form
- `empty` (filtered) — selected category has no matching assets (library is otherwise non-empty); message names the category. CTA: clear filter or add an asset
- `populated` — grid view (desktop default) or list/row view; category chips and view toggle shown; each card links to `/app/assets/:id/maintenance`; sharing indicators on cards ("Shared with team" / "Shared by {owner}" / none)
- `populated` (filtered) — a category chip is active; the loaded list is narrowed to that asset type

**Content stress:** long asset name on cards; long owner display name in sharing badge; long property address (street + city + state) in property card summaries

**Non-obvious behavior:**

- There is **no inline search box** on this screen — finding a specific asset is handled by global [App Search](#app-search) (`cmd/ctrl+K` or the top-bar button)
- Category filter chips show **per-category counts that come from the API**; selecting a chip filters the **already-loaded** list **client-side** with no refetch — the same pattern as the Dashboard queue filter. The selected category is ephemeral client state and is never sent to the API
- Sharing badges are display-only on this screen; share/unshare lives on the asset maintenance page
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

**States:**

- Closed — not shown
- Open (idle, empty query) — "Search your assets" / "Try a name, make, model, address, VIN, or serial number." (no API call until ≥1 non-space character)
- `loading` — debounced; loading indicator while the request is in flight
- `error` — retryable error state; 401 redirects to `/login`
- `empty` (no matches) — "No assets match {query}" / "Try fewer words or another asset detail." CTA: none (refine query)
- `populated` — ranked list from `GET /api/search?q=…`; each row shows name, type, a summary line, and a sharing marker when applicable; selecting a result navigates to that asset's maintenance page (`/app/assets/:id/maintenance`)

**Content stress:** long asset name in result rows; long summary line; long owner display name in sharing badge

**Non-obvious behavior:**

- The client debounces input and **suppresses the API call until there is ≥1 non-space character** — the API's 422 on an empty query is a safety net, not the normal path
- Results arrive **pre-ranked and pre-summarized** from the API; the client renders them and does not recompute ordering or the summary line (ADR-0009)
- Sharing markers are rendered from the search hit `sharing` descriptor — same copy rules as the library and dashboard
- `cmd+k` is intercepted globally and must not collide with the browser's own shortcuts
- Desktop presentation is a command palette overlay; mobile presentation is a full-screen sheet
- App Search is the **only** asset-search affordance — the Asset Library has no inline search box; its toolbar is for category filtering and grid/list view only

**Spec:** [`docs/specs/features/app-search.md`](../specs/features/app-search.md)

---

## Activity History

**Route:** `/app/history`
**Goal:** Let the user review a durable, cross-asset timeline of actions they have taken across their fleet (owned assets and assets currently shared with their team).

**States:**

- `loading` — fetches `GET /api/activity` before rendering the feed
- `error` — feed-level retry state
- `unauthorized` (401) — `[gallery:excluded #195]` lock icon, "Redirecting to sign in" / "Your session is no longer active." then navigates to `/login`
- `empty` (no account history) — explains that future asset, maintenance, and task actions will appear. CTA: none (passive)
- `empty` (filtered) — active filters/search remain visible and can be cleared. CTA: clear filters
- `populated` — reverse-chronological timeline grouped by action day, with an all-time activity breakdown rail; each entry shows action type, title/name, asset snapshot, actor attribution ("by you" / teammate name), relative time, and absolute time
- `populated` (filtered) — type chips and a single asset selector refetch the server-side filtered feed
- `populated` (paginated) — "Load older" requests the next cursor while preserving active filters

**Content stress:** long asset name in entries; long action title; long teammate display name in actor attribution; collection at pagination boundary

**Non-obvious behavior:**

- The first API page returns the activity page, available filters, counts, and cursor in one read model; cursor pages preserve those first-page filters while loading older entries
- The feed spans owned assets and assets currently shared with the caller's team; unshare drops those entries on the next fetch
- Actor attribution uses `viewerUserId` plus each entry's `actor` snapshot — "by you" when the actor is the viewer, otherwise the teammate's display name (never email)
- The client does not filter a preloaded history locally for type or asset filters
- The History search field is intentionally labeled as loaded-history search and only narrows fetched pages client-side
- Filter counts come from the caller's accessible history, not the current filtered view
- Deleted tasks and archived/renamed assets still render from the event snapshot
- Completing a scheduled task by logging work appears as one `task_completed` row, not as both completed and logged rows
- 401 response redirects to `/login`

**Spec:** [`docs/specs/features/activity-history.md`](../specs/features/activity-history.md)

---

## Add Asset

**Route:** `/app/assets/new`
**Goal:** Let the user register a new asset (vehicle, equipment, or property) with a name, type, and the type-specific details for that asset kind.

**States:**

- Idle, vehicle type — blank form with vehicle fields (year, make, model, VIN)
- Idle, property type — blank form with property fields (street, city, state, postal code, country)
- Idle, equipment type — blank form with equipment fields (manufacturer, model number, serial number)

**Exceptions:** The three "Idle" states are non-vocab — they are mutually exclusive field-set renders off the selected asset type, not async states. Named plainly to distinguish them from the vocabulary tokens.

**Mutations:**

- `pending` — form disabled while the API call is in flight
- `error` (client validation) — inline field errors on submit with focus moved to the first invalid field
- `error` (API) — inline error message; form re-enabled for correction; 422 field errors mapped to individual inputs; 401 redirects to `/login`

Success is a navigate-away transition (invalidates assets query, navigates to `/app/assets`), not a stable screen — not enumerable for the gallery.

**Content stress:** long asset name (maximum-length input); long property address (street + city + state + postal code + country)

**Non-obvious behavior:**

- 401 on submit redirects to `/login`
- Client-side validation runs before the API call; field errors map from the API's 422 response if server validation also fails

**Spec:** [`docs/specs/features/create-asset.md`](../specs/features/create-asset.md)

---

## Asset Maintenance Records & Tasks

**Route:** `/app/assets/:id/maintenance`
**Goal:** Let the user view and log maintenance history for a specific asset, manage upcoming maintenance tasks, and (if they own the asset) share or unshare it with their team.

**States:**

- `loading` — fetching asset, records, and tasks in parallel
- `error` (forbidden / 403) — dedicated `MRErrorState`: "Access denied" / "This asset belongs to another account. You don't have permission to view its maintenance history." No retry, no redirect
- `error` (not found / 404) — dedicated `MRErrorState`: "Asset not found" / "We couldn't find this asset. It may have been removed." No retry, no redirect
- `error` (load failure) — dedicated `MRErrorState`: "Couldn't load history" / "Something went wrong fetching maintenance records." with "Try again" retry
- `empty` (no records) — prompt to log first record. CTA: open create-record form
- `empty` (no tasks) — prompt to add first task. CTA: open create-task form
- `populated` — chronological list of records; task list with overdue/upcoming indicators
- `populated` (shared by teammate) — badge + strip explaining who shared it; no share control

**Mutations:**

- `pending` (create record) — inline or modal form validates date and description; submits to API
- `pending` (create task) — inline form validates title and due date
- `pending` (share/unshare, owner only) — sheet/drawer to share the asset to the caller's team or unshare it back to personal
- `error` — inline field errors; 401 redirects to `/login`

**Local UI states (not async):**

- Delete-task confirm — local "Delete task?" confirm dialog with Delete/Cancel buttons, distinct from any mutation `isPending` (the deletion is a direct async call, not a `useMutation`)

**Content stress:** long asset name in header; long record description; long task title; long owner display name in sharing badge

**Exceptions:** Share control shows a "no team" state (sheet explains a team is required, links to `/app/team`) when the owner has no team — a value state, not an async state.

**Non-obvious behavior:**

- Records and tasks are fetched independently; one can load before the other
- Dates are stored as ISO strings (YYYY-MM-DD) and displayed as human-readable relative dates ("3 days ago", "yesterday")
- 401 on any fetch redirects to `/login`
- Sharing uses the asset's server-computed `sharing` descriptor (`scope`, `isOwner`, optional `ownerDisplayName`); only the asset owner can change sharing
- Share/unshare are idempotent on the API; the sheet closes on success and refreshes the asset query

**Spec:** [`docs/specs/features/maintenance-record.md`](../specs/features/maintenance-record.md), [`docs/specs/features/maintenance-task.md`](../specs/features/maintenance-task.md), [`docs/specs/features/teams-foundation.md`](../specs/features/teams-foundation.md)

---

## Team

**Route:** `/app/team` (accessed via a "My team" link on the profile page)
**Goal:** Let the user create a team and view their team and its members.

**States:**

- `loading` — fetches `GET /api/teams/me` before rendering
- `error` — generic error banner with retry
- `unauthorized` (401) — `[gallery:excluded #195]` "Redirecting to sign in…" then navigates to `/login`
- `empty` (no team) — EmptyState prompt: "You don't have a team yet" / "Create a team, then invite the one teammate you work with. You'll decide which assets to share — the rest stay yours alone." CTA: "Create a team" button (transitions to the form view)
- Form (create team) — separate view with name field (placeholder "e.g. The Ortega Household"), char counter, validation, and "Create team" submit; Cancel returns to the empty view
- `populated` (has team) — team name, member count, and a member list with display name and role

**Exceptions:** "Form (create team)" is a non-vocab local UI state — a value-state view transitioned to from the empty CTA, not an async state. Written plainly to distinguish it from vocabulary tokens.

**Mutations:**

- `pending` (create team) — submit button disabled while in flight
- `error` (validation) — inline field error on empty or over-length name
- `error` (409 conflict) — banner explaining the user already belongs to a team
- `error` (API) — generic error banner with retry

**Content stress:** long team name (100 characters); long member display name

**Non-obvious behavior:**

- A user can belong to at most one team; the create form is only shown when the query returns `{ team: null }`
- The team name follows the same validation rules as the display name (required, trimmed, max 100 characters)
- Until the invitations spec lands, a team has exactly one member — its creator — so the member list always shows a single owner
- The page is accessed from the profile page via a "My team" link row, not from the app nav tabs — teams become more prominent once invitations and sharing are available
- 401 from the API redirects to `/login`

**Spec:** [`docs/specs/features/teams-foundation.md`](../specs/features/teams-foundation.md)
