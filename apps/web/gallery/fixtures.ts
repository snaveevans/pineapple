/** API fixture payloads for gallery renders. Shapes match existing component tests. */

export const PROFILE = {
  email: "dale@fieldops-demo.com",
  name: "Dale Evans",
  onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
  notificationEmail: null,
  notificationEmailVerified: false,
};

/**
 * Host fixture for populated-profile-edit — distinct display name so it is not a
 * silent byte-twin of contact-email-unset (same route, unset contact).
 */
export const PROFILE_EDIT_HOST = {
  ...PROFILE,
  name: "Dale R. Evans",
};

/** Shell-only profile so the avatar initial is not a twin of every Dale-hosted shot. */
export const PROFILE_SHELL = {
  ...PROFILE,
  name: "Jamie Ortega",
};

export const EMPTY_NOTIFS = {
  notifications: [],
  unreadCount: 0,
  nextCursor: null,
};

export const FIXED_NOW = "2026-07-02T22:00:00.000Z";

export const ASSETS_POPULATED = {
  assets: [
    {
      id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
      name: "Truck",
      type: "vehicle",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "team", isOwner: true },
    },
    {
      id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
      name: "Generator",
      type: "equipment",
      metadata: { kind: "equipment", manufacturer: "Generac", modelNumber: "7043" },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "team", isOwner: false, ownerDisplayName: "Pat" },
    },
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Cabin",
      type: "property",
      metadata: {
        kind: "property",
        address: {
          street: "1 Lake Rd",
          city: "Frisco",
          state: "CO",
          postalCode: "80443",
          country: "US",
        },
      },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "personal", isOwner: true },
    },
  ],
  counts: { all: 3, vehicle: 1, equipment: 1, property: 1 },
};

export const ASSETS_NO_PROPERTY = {
  assets: ASSETS_POPULATED.assets.filter((a) => a.type !== "property"),
  counts: { all: 2, vehicle: 1, equipment: 1, property: 0 },
};

export const ASSETS_EMPTY = {
  assets: [],
  counts: { all: 0, vehicle: 0, equipment: 0, property: 0 },
};

export const NOTIFICATIONS_POPULATED = {
  notifications: [
    {
      id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
      type: "maintenance_due_soon",
      createdAt: "2026-07-02T14:00:00.000Z",
      readAt: null,
      asset: {
        id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
        name: "Ford F-150",
        type: "vehicle",
      },
      task: {
        id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        title: "Oil change",
        nextDue: "2026-07-04",
      },
    },
    {
      id: "3a80690d-df95-4128-8183-42776a6777db",
      type: "maintenance_due_soon",
      createdAt: "2026-07-01T18:05:00.000Z",
      readAt: "2026-07-01T19:00:00.000Z",
      asset: {
        id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
        name: "Toro ZTR Mower",
        type: "equipment",
      },
      task: {
        id: "459b8627-012b-44f7-8ab1-8b0305bc106b",
        title: "Blade sharpen",
        nextDue: "2026-07-02",
      },
    },
  ],
  unreadCount: 1,
  nextCursor: null as string | null,
};

export const NOTIFICATIONS_PAGINATED = {
  ...NOTIFICATIONS_POPULATED,
  nextCursor: "cursor-page-2",
};

export const NOTIFICATIONS_EMPTY = {
  notifications: [],
  unreadCount: 0,
  nextCursor: null,
};

const VIEWER_USER_ID = "7d914909-c903-41a4-a13a-82cbd0f61851";
const TEAMMATE_USER_ID = "71afbc20-f2e0-4fc8-a989-278437cf792c";

const ACTIVITY_ENTRIES = [
  {
    id: "f60feab8-48df-4947-ae58-6ef7257531da",
    type: "task_scheduled",
    occurredAt: "2026-07-01T10:00:00.000Z",
    asset: {
      id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
      name: "Sprinter Van",
      type: "vehicle",
    },
    actor: { id: VIEWER_USER_ID, displayName: "Dale" },
    title: "Cabin filter",
  },
  {
    id: "5a82e4fc-f71e-4efd-9b2e-db42c422c594",
    type: "maintenance_logged",
    occurredAt: "2026-06-30T10:00:00.000Z",
    asset: {
      id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
      name: "Generac Generator",
      type: "equipment",
    },
    actor: { id: TEAMMATE_USER_ID, displayName: "Pat Rivera" },
    title: "Oil change",
    performedAt: "2026-06-30",
  },
] as const;

export const ACTIVITY_POPULATED = {
  viewerUserId: VIEWER_USER_ID,
  entries: [...ACTIVITY_ENTRIES],
  availableFilters: {
    types: [
      { type: "task_scheduled", count: 1 },
      { type: "maintenance_logged", count: 1 },
    ],
    assets: [
      { asset: ACTIVITY_ENTRIES[0].asset, count: 1 },
      { asset: ACTIVITY_ENTRIES[1].asset, count: 1 },
    ],
  },
  nextCursor: null as string | null,
};

export const ACTIVITY_PAGINATED = {
  ...ACTIVITY_POPULATED,
  nextCursor: "activity-cursor-2",
};

export const ACTIVITY_EMPTY = {
  viewerUserId: VIEWER_USER_ID,
  entries: [],
  availableFilters: { types: [], assets: [] },
  nextCursor: null,
};

/** Server-filtered to a type with zero entries while filters stay available. */
export function activityFilteredEmpty(): typeof ACTIVITY_POPULATED {
  return {
    viewerUserId: VIEWER_USER_ID,
    entries: [],
    availableFilters: ACTIVITY_POPULATED.availableFilters,
    nextCursor: null,
  };
}

/** Server-filtered to task_scheduled only. */
export function activityFilteredPopulated(): typeof ACTIVITY_POPULATED {
  const entry = ACTIVITY_ENTRIES[0];
  return {
    viewerUserId: VIEWER_USER_ID,
    entries: [entry],
    availableFilters: ACTIVITY_POPULATED.availableFilters,
    nextCursor: null,
  };
}

export const TEAM_EMPTY = {
  team: null,
  viewerUserId: VIEWER_USER_ID,
};

/** Single owner only — FEATURES.md: invitations not landed yet. */
export const TEAM_POPULATED = {
  team: {
    id: "aaa11100-0000-0000-0000-000000000001",
    name: "The Ortega Household",
    ownerId: VIEWER_USER_ID,
    members: [{ userId: VIEWER_USER_ID, name: "Jamie Ortega", role: "owner" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  viewerUserId: VIEWER_USER_ID,
};

export const TRUCK_ID = "195d0ef0-47f5-439f-abfd-29f892c9a040";
export const GENERATOR_ID = "337f2d25-f1ab-4544-af2e-8196aa9d5a11";

export const PROFILE_INCOMPLETE_WITH_NAME = {
  email: "dale@fieldops-demo.com",
  name: "Dale Evans",
  onboardingCompletedAt: null,
  notificationEmail: null,
  notificationEmailVerified: false,
};

export const PROFILE_INCOMPLETE_NO_NAME = {
  email: "dale@fieldops-demo.com",
  name: null,
  onboardingCompletedAt: null,
  notificationEmail: null,
  notificationEmailVerified: false,
};

export const AUTH_SESSION_AUTHENTICATED = {
  session: { id: "sess-gallery-1", userId: VIEWER_USER_ID },
  user: { id: VIEWER_USER_ID, email: "dale@fieldops-demo.com", name: "Dale Evans" },
};

export const AUTH_SESSION_NONE = {
  session: null,
  user: null,
};

export const ASSET_OWNED = {
  id: TRUCK_ID,
  name: "Truck",
  type: "vehicle",
  metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sharing: { scope: "personal" as const, isOwner: true },
};

export const ASSET_SHARED_BY = {
  id: GENERATOR_ID,
  name: "Generator",
  type: "equipment",
  metadata: { kind: "equipment", manufacturer: "Generac", modelNumber: "7043" },
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sharing: {
    scope: "team" as const,
    isOwner: false,
    ownerDisplayName: "Pat Rivera",
  },
};

export const RECORDS_EMPTY = { maintenanceRecords: [] as const };
export const TASKS_EMPTY = { maintenanceTasks: [] as const };

// Domain-legal pairs vs FIXED_NOW (2026-07-02): nextDue = lastCompleted + interval;
// linked records do not contradict task.lastCompletedDate / nextDue (advance() rules).
export const RECORDS_POPULATED = {
  maintenanceRecords: [
    {
      id: "e914b960-772f-46a7-b6fb-f333dcfc7fc9",
      assetId: TRUCK_ID,
      title: "Oil change",
      performedAt: "2026-03-14",
      notes: "Used 7 quarts of synthetic oil.",
      taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      createdAt: "2026-03-14T18:25:24.887Z",
    },
    {
      id: "f60feab8-48df-4947-ae58-6ef7257531da",
      assetId: TRUCK_ID,
      title: "Tire rotation",
      performedAt: "2026-02-01",
      notes: null,
      taskId: null,
      createdAt: "2026-02-01T12:00:00.000Z",
    },
  ],
};

export const TASKS_POPULATED = {
  maintenanceTasks: [
    {
      id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      assetId: TRUCK_ID,
      title: "Oil change",
      intervalValue: 3,
      intervalUnit: "month" as const,
      // lastCompleted 2026-03-14 + 3 months → nextDue 2026-06-14; daysDue vs 2026-07-02 = -18
      lastCompletedDate: "2026-03-14",
      nextDue: "2026-06-14",
      status: "overdue" as const,
      daysDue: -18,
      createdAt: "2026-01-15T12:00:00.000Z",
    },
    {
      id: "b2c3d4e5-f6a7-4890-bcde-f12345678901",
      assetId: TRUCK_ID,
      title: "Cabin filter",
      intervalValue: 6,
      intervalUnit: "month" as const,
      // lastCompleted 2026-01-10 + 6 months → nextDue 2026-07-10; daysDue vs 2026-07-02 = 8
      lastCompletedDate: "2026-01-10",
      nextDue: "2026-07-10",
      status: "soon" as const,
      daysDue: 8,
      createdAt: "2026-02-01T12:00:00.000Z",
    },
  ],
};

export const RECORDS_POPULATED_SHARED = {
  maintenanceRecords: RECORDS_POPULATED.maintenanceRecords.map((r) => ({
    ...r,
    assetId: GENERATOR_ID,
  })),
};

export const TASKS_POPULATED_SHARED = {
  maintenanceTasks: TASKS_POPULATED.maintenanceTasks.map((t) => ({
    ...t,
    assetId: GENERATOR_ID,
  })),
};

export const DASHBOARD_EMPTY_FLEET = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 0, vehicle: 0, equipment: 0, property: 0 },
  fleetHealth: { overdue: 0, soon: 0, onTrack: 0, unscheduled: 0 },
  queueCountsByCategory: { all: 0, vehicle: 0, equipment: 0, property: 0 },
  queue: [] as const,
};

export const DASHBOARD_NO_TASKS = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 3, vehicle: 1, equipment: 1, property: 1 },
  fleetHealth: { overdue: 0, soon: 0, onTrack: 0, unscheduled: 3 },
  queueCountsByCategory: { all: 0, vehicle: 0, equipment: 0, property: 0 },
  queue: [] as const,
};

export const DASHBOARD_POPULATED = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 3, vehicle: 1, equipment: 1, property: 1 },
  fleetHealth: { overdue: 1, soon: 1, onTrack: 0, unscheduled: 1 },
  queueCountsByCategory: { all: 2, vehicle: 1, equipment: 1, property: 0 },
  queue: [
    {
      taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      taskTitle: "Oil change",
      nextDue: "2026-06-14",
      status: "overdue" as const,
      daysDue: -18,
      intervalValue: 3,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-03-14",
      createdAt: "2026-01-15T12:00:00.000Z",
      assetId: TRUCK_ID,
      assetName: "Work Truck",
      assetType: "vehicle" as const,
      sharing: { scope: "personal" as const, isOwner: true },
    },
    {
      taskId: "459b8627-012b-44f7-8ab1-8b0305bc106b",
      taskTitle: "Blade sharpen",
      nextDue: "2026-07-04",
      status: "soon" as const,
      daysDue: 2,
      intervalValue: 1,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-06-04",
      createdAt: "2026-02-01T12:00:00.000Z",
      assetId: GENERATOR_ID,
      assetName: "Toro ZTR Mower",
      assetType: "equipment" as const,
      sharing: {
        scope: "team" as const,
        isOwner: false,
        ownerDisplayName: "Pat",
      },
    },
  ],
};

export const SEARCH_POPULATED = {
  results: [
    {
      id: TRUCK_ID,
      name: "Work Truck",
      type: "vehicle" as const,
      summary: "2020 Ford F-150",
      sharing: { scope: "team" as const, isOwner: true },
    },
    {
      id: GENERATOR_ID,
      name: "Teammate Ram",
      type: "vehicle" as const,
      summary: "2021 Ram 2500",
      sharing: {
        scope: "team" as const,
        isOwner: false,
        ownerDisplayName: "Pat",
      },
    },
  ],
};

export const SEARCH_EMPTY = { results: [] as const };

// ── Content-stress literals (fixed checked-in strings; documented maxima) ──

/** Display name documented max — exactly 100 characters. */
export const DISPLAY_NAME_100 =
  "Alexandra Montgomery-Whitfield of Riverside Field Ops Cooperative Unit Seven-North Annex A1-B2-C3-D4";

/** Team name documented max — exactly 100 characters. */
export const TEAM_NAME_100 =
  "Ortega Household Field Operations Cooperative Mountain Division Station Alpha Primary Team-01-A2-B3C";

/** Task / record title documented max — exactly 100 characters. */
export const TASK_TITLE_100 =
  "Quarterly multi-point oil change with full inspection, filter service, and fluid top-off A1-B2-C3-D4";

/** Long asset name for layout stress (API has no hard max; fixed literal). */
export const LONG_ASSET_NAME =
  "2020 Ford F-150 SuperCrew XLT 4x4 Fleet Work Truck Unit Alpha-07 Mountain Division";

/** Long contact email for profile layout stress. */
export const LONG_CONTACT_EMAIL =
  "dale.evans.field.operations.notifications+maintenance-reminders@homemail.example.com";

/** Long property street line. */
export const LONG_STREET = "1847 North Mountain View Boulevard East Suite 200B";

/** Long city for property address stress. */
export const LONG_CITY = "San Buenaventura del Monte Verde";

/**
 * Record notes documented max — exactly 1000 characters (literal, not generated).
 * Sentence repeated and cut at the documented ceiling.
 */
export const RECORD_NOTES_1000 =
  "Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter with OEM part FO-12345. Inspected belts, hoses, and air filter; topped washer fluid. Used 7 quarts of full synthetic 5W-30 oil and replaced the oil filter ";

export const PROFILE_CONTACT_UNVERIFIED = {
  ...PROFILE,
  notificationEmail: "dale@homemail.com",
  notificationEmailVerified: false,
};

export const PROFILE_CONTACT_VERIFIED = {
  ...PROFILE,
  notificationEmail: "dale@homemail.com",
  notificationEmailVerified: true,
};

export const PROFILE_DISPLAY_NAME_100 = {
  ...PROFILE,
  name: DISPLAY_NAME_100,
};

export const PROFILE_LONG_CONTACT_EMAIL = {
  ...PROFILE,
  notificationEmail: LONG_CONTACT_EMAIL,
  notificationEmailVerified: false,
};

export const NOTIFICATIONS_LONG_ASSET = {
  notifications: [
    {
      id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
      type: "maintenance_due_soon",
      createdAt: "2026-07-02T14:00:00.000Z",
      readAt: null,
      asset: { id: TRUCK_ID, name: LONG_ASSET_NAME, type: "vehicle" },
      task: {
        id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        title: "Oil change",
        nextDue: "2026-07-04",
      },
    },
  ],
  unreadCount: 1,
  nextCursor: null as string | null,
};

export const NOTIFICATIONS_LONG_TASK = {
  notifications: [
    {
      id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
      type: "maintenance_due_soon",
      createdAt: "2026-07-02T14:00:00.000Z",
      readAt: null,
      asset: { id: TRUCK_ID, name: "Ford F-150", type: "vehicle" },
      task: {
        id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        title: TASK_TITLE_100,
        nextDue: "2026-07-04",
      },
    },
  ],
  unreadCount: 1,
  nextCursor: null as string | null,
};

/**
 * Pagination-boundary stress — Load older visible, content distinct from
 * notifications/populated-paginated so the pair is not a silent byte-twin.
 */
export const NOTIFICATIONS_PAGINATION_BOUNDARY = {
  notifications: [
    {
      id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
      type: "maintenance_due_soon",
      createdAt: "2026-07-02T14:00:00.000Z",
      readAt: null,
      asset: { id: TRUCK_ID, name: "Ford F-150", type: "vehicle" },
      task: {
        id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        title: "Brake inspection",
        nextDue: "2026-07-04",
      },
    },
    {
      id: "3a80690d-df95-4128-8183-42776a6777db",
      type: "maintenance_due_soon",
      createdAt: "2026-07-01T18:05:00.000Z",
      readAt: "2026-07-01T19:00:00.000Z",
      asset: { id: GENERATOR_ID, name: "Toro ZTR Mower", type: "equipment" },
      task: {
        id: "459b8627-012b-44f7-8ab1-8b0305bc106b",
        title: "Deck leveling",
        nextDue: "2026-07-02",
      },
    },
  ],
  unreadCount: 1,
  nextCursor: "notif-cursor-boundary" as string | null,
};

/** Single overdue vehicle queue item — aggregates match the queue (ADR-0009). */
export const DASHBOARD_LONG_ASSET = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 1, vehicle: 1, equipment: 0, property: 0 },
  fleetHealth: { overdue: 1, soon: 0, onTrack: 0, unscheduled: 0 },
  queueCountsByCategory: { all: 1, vehicle: 1, equipment: 0, property: 0 },
  queue: [
    {
      taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      taskTitle: "Oil change",
      nextDue: "2026-06-14",
      status: "overdue" as const,
      daysDue: -18,
      intervalValue: 3,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-03-14",
      createdAt: "2026-01-15T12:00:00.000Z",
      assetId: TRUCK_ID,
      assetName: LONG_ASSET_NAME,
      assetType: "vehicle" as const,
      sharing: { scope: "personal" as const, isOwner: true },
    },
  ],
};

/** Single overdue vehicle queue item with max-length task title. */
export const DASHBOARD_LONG_TASK = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 1, vehicle: 1, equipment: 0, property: 0 },
  fleetHealth: { overdue: 1, soon: 0, onTrack: 0, unscheduled: 0 },
  queueCountsByCategory: { all: 1, vehicle: 1, equipment: 0, property: 0 },
  queue: [
    {
      taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      taskTitle: TASK_TITLE_100,
      nextDue: "2026-06-14",
      status: "overdue" as const,
      daysDue: -18,
      intervalValue: 3,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-03-14",
      createdAt: "2026-01-15T12:00:00.000Z",
      assetId: TRUCK_ID,
      assetName: "Work Truck",
      assetType: "vehicle" as const,
      sharing: { scope: "personal" as const, isOwner: true },
    },
  ],
};

/** Single soon equipment queue item owned by a long display name. */
export const DASHBOARD_LONG_OWNER = {
  viewerDisplayName: "Dale Evans",
  todayUtc: "2026-07-02",
  fleetTotals: { total: 1, vehicle: 0, equipment: 1, property: 0 },
  fleetHealth: { overdue: 0, soon: 1, onTrack: 0, unscheduled: 0 },
  queueCountsByCategory: { all: 1, vehicle: 0, equipment: 1, property: 0 },
  queue: [
    {
      taskId: "459b8627-012b-44f7-8ab1-8b0305bc106b",
      taskTitle: "Blade sharpen",
      nextDue: "2026-07-04",
      status: "soon" as const,
      daysDue: 2,
      intervalValue: 1,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-06-04",
      createdAt: "2026-02-01T12:00:00.000Z",
      assetId: GENERATOR_ID,
      assetName: "Toro ZTR Mower",
      assetType: "equipment" as const,
      sharing: {
        scope: "team" as const,
        isOwner: false,
        ownerDisplayName: DISPLAY_NAME_100,
      },
    },
  ],
};

export const ASSETS_LONG_NAME = {
  assets: [
    {
      id: TRUCK_ID,
      name: LONG_ASSET_NAME,
      type: "vehicle",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "team", isOwner: true },
    },
  ],
  counts: { all: 1, vehicle: 1, equipment: 0, property: 0 },
};

export const ASSETS_LONG_OWNER = {
  assets: [
    {
      id: GENERATOR_ID,
      name: "Generator",
      type: "equipment",
      metadata: { kind: "equipment", manufacturer: "Generac", modelNumber: "7043" },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "team", isOwner: false, ownerDisplayName: DISPLAY_NAME_100 },
    },
  ],
  counts: { all: 1, vehicle: 0, equipment: 1, property: 0 },
};

export const ASSETS_LONG_ADDRESS = {
  assets: [
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Cabin",
      type: "property",
      metadata: {
        kind: "property",
        address: {
          street: LONG_STREET,
          city: LONG_CITY,
          state: "CA",
          postalCode: "93001",
          country: "US",
        },
      },
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sharing: { scope: "personal", isOwner: true },
    },
  ],
  counts: { all: 1, vehicle: 0, equipment: 0, property: 1 },
};

export const SEARCH_LONG_ASSET = {
  results: [
    {
      id: TRUCK_ID,
      name: LONG_ASSET_NAME,
      type: "vehicle" as const,
      summary: "2020 Ford F-150",
      sharing: { scope: "team" as const, isOwner: true },
    },
  ],
};

export const SEARCH_LONG_SUMMARY = {
  results: [
    {
      id: TRUCK_ID,
      name: "Work Truck",
      type: "vehicle" as const,
      summary: "2020 Ford F-150 SuperCrew XLT 4x4 with extended cargo package and crew cab seating",
      sharing: { scope: "team" as const, isOwner: true },
    },
  ],
};

export const SEARCH_LONG_OWNER = {
  results: [
    {
      id: GENERATOR_ID,
      name: "Teammate Ram",
      type: "vehicle" as const,
      summary: "2021 Ram 2500",
      sharing: {
        scope: "team" as const,
        isOwner: false,
        ownerDisplayName: DISPLAY_NAME_100,
      },
    },
  ],
};

export const ACTIVITY_LONG_ASSET = {
  viewerUserId: VIEWER_USER_ID,
  entries: [
    {
      id: "f60feab8-48df-4947-ae58-6ef7257531da",
      type: "task_scheduled",
      occurredAt: "2026-07-01T10:00:00.000Z",
      asset: { id: TRUCK_ID, name: LONG_ASSET_NAME, type: "vehicle" },
      actor: { id: VIEWER_USER_ID, displayName: "Dale" },
      title: "Cabin filter",
    },
  ],
  availableFilters: {
    types: [{ type: "task_scheduled", count: 1 }],
    assets: [{ asset: { id: TRUCK_ID, name: LONG_ASSET_NAME, type: "vehicle" }, count: 1 }],
  },
  nextCursor: null as string | null,
};

export const ACTIVITY_LONG_TITLE = {
  viewerUserId: VIEWER_USER_ID,
  entries: [
    {
      id: "f60feab8-48df-4947-ae58-6ef7257531da",
      type: "task_scheduled",
      occurredAt: "2026-07-01T10:00:00.000Z",
      asset: { id: TRUCK_ID, name: "Sprinter Van", type: "vehicle" },
      actor: { id: VIEWER_USER_ID, displayName: "Dale" },
      title: TASK_TITLE_100,
    },
  ],
  availableFilters: {
    types: [{ type: "task_scheduled", count: 1 }],
    assets: [{ asset: { id: TRUCK_ID, name: "Sprinter Van", type: "vehicle" }, count: 1 }],
  },
  nextCursor: null as string | null,
};

export const ACTIVITY_LONG_ACTOR = {
  viewerUserId: VIEWER_USER_ID,
  entries: [
    {
      id: "5a82e4fc-f71e-4efd-9b2e-db42c422c594",
      type: "maintenance_logged",
      occurredAt: "2026-06-30T10:00:00.000Z",
      asset: { id: GENERATOR_ID, name: "Generac Generator", type: "equipment" },
      actor: { id: TEAMMATE_USER_ID, displayName: DISPLAY_NAME_100 },
      title: "Oil change",
      performedAt: "2026-06-30",
    },
  ],
  availableFilters: {
    types: [{ type: "maintenance_logged", count: 1 }],
    assets: [
      { asset: { id: GENERATOR_ID, name: "Generac Generator", type: "equipment" }, count: 1 },
    ],
  },
  nextCursor: null as string | null,
};

/**
 * Pagination-boundary stress — Load older visible, content distinct from
 * activity-history/populated-paginated so the pair is not a silent byte-twin.
 */
export const ACTIVITY_PAGINATION_BOUNDARY = {
  viewerUserId: VIEWER_USER_ID,
  entries: [
    {
      id: "f60feab8-48df-4947-ae58-6ef7257531da",
      type: "task_scheduled",
      occurredAt: "2026-07-01T10:00:00.000Z",
      asset: { id: TRUCK_ID, name: "Sprinter Van", type: "vehicle" },
      actor: { id: VIEWER_USER_ID, displayName: "Dale" },
      title: "Brake fluid flush",
    },
    {
      id: "5a82e4fc-f71e-4efd-9b2e-db42c422c594",
      type: "maintenance_logged",
      occurredAt: "2026-06-30T10:00:00.000Z",
      asset: { id: GENERATOR_ID, name: "Generac Generator", type: "equipment" },
      actor: { id: TEAMMATE_USER_ID, displayName: "Pat Rivera" },
      title: "Spark plug set",
      performedAt: "2026-06-30",
    },
  ],
  availableFilters: ACTIVITY_POPULATED.availableFilters,
  nextCursor: "activity-cursor-boundary" as string | null,
};

export const ASSET_LONG_NAME = {
  ...ASSET_OWNED,
  name: LONG_ASSET_NAME,
};

export const ASSET_LONG_OWNER = {
  ...ASSET_SHARED_BY,
  sharing: {
    scope: "team" as const,
    isOwner: false,
    ownerDisplayName: DISPLAY_NAME_100,
  },
};

export const RECORDS_LONG_NOTES = {
  maintenanceRecords: [
    {
      id: "e914b960-772f-46a7-b6fb-f333dcfc7fc9",
      assetId: TRUCK_ID,
      title: "Oil change",
      performedAt: "2026-03-14",
      notes: RECORD_NOTES_1000,
      taskId: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      createdAt: "2026-03-14T18:25:24.887Z",
    },
  ],
};

export const TASKS_LONG_TITLE = {
  maintenanceTasks: [
    {
      id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      assetId: TRUCK_ID,
      title: TASK_TITLE_100,
      intervalValue: 3,
      intervalUnit: "month" as const,
      lastCompletedDate: "2026-03-14",
      nextDue: "2026-06-14",
      status: "overdue" as const,
      daysDue: -18,
      createdAt: "2026-01-15T12:00:00.000Z",
    },
  ],
};

export const TEAM_LONG_NAME = {
  team: {
    id: "aaa11100-0000-0000-0000-000000000001",
    name: TEAM_NAME_100,
    ownerId: VIEWER_USER_ID,
    members: [{ userId: VIEWER_USER_ID, name: "Jamie Ortega", role: "owner" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  viewerUserId: VIEWER_USER_ID,
};

export const TEAM_LONG_MEMBER = {
  team: {
    id: "aaa11100-0000-0000-0000-000000000001",
    name: "The Ortega Household",
    ownerId: VIEWER_USER_ID,
    members: [{ userId: VIEWER_USER_ID, name: DISPLAY_NAME_100, role: "owner" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  viewerUserId: VIEWER_USER_ID,
};

/** Success body for contact-email PUT. */
export function profileAfterEmailSet(email: string, verified = false) {
  return {
    ...PROFILE,
    notificationEmail: email,
    notificationEmailVerified: verified,
  };
}
