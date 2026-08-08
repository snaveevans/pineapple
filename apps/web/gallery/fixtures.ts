/** API fixture payloads for gallery renders. Shapes match existing component tests. */

export const PROFILE = {
  email: "dale@fieldops-demo.com",
  name: "Dale Evans",
  onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
  notificationEmail: null,
  notificationEmailVerified: false,
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

export const TEAM_POPULATED = {
  team: {
    id: "aaa11100-0000-0000-0000-000000000001",
    name: "The Ortega Household",
    ownerId: VIEWER_USER_ID,
    members: [
      { userId: VIEWER_USER_ID, name: "Jamie Ortega", role: "owner" },
      {
        userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        name: "Alex Partner",
        role: "member",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  viewerUserId: VIEWER_USER_ID,
};
