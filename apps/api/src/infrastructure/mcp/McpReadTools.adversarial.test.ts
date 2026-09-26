import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  McpServer,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import {
  AssetId,
  Email,
  MaintenanceRecordId,
  MaintenanceTaskId,
  TeamId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { GetAsset } from "../../application/usecases/GetAsset.ts";
import { GetDashboard } from "../../application/usecases/GetDashboard.ts";
import { ListAssets } from "../../application/usecases/ListAssets.ts";
import { ListMaintenanceRecords } from "../../application/usecases/ListMaintenanceRecords.ts";
import { ListMaintenanceTasks } from "../../application/usecases/ListMaintenanceTasks.ts";
import type { TaskSnoozeReader } from "../../application/ports/TaskSnoozeReader.ts";
import type { UtcDateProvider } from "../../application/ports/UtcDateProvider.ts";
import { Asset } from "../../domain/asset/Asset.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { D1AssetRepository } from "../persistence/D1AssetRepository.ts";
import { D1MaintenanceRecordRepository } from "../persistence/D1MaintenanceRecordRepository.ts";
import { D1MaintenanceTaskRepository } from "../persistence/D1MaintenanceTaskRepository.ts";
import { registerReadTools, type McpReadDependencies } from "./McpReadTools.ts";

const todayUtc = "2026-09-25";
const callerId = UserId.generate();
const ownerId = UserId.generate();
const foreignOwnerId = UserId.generate();
const teamId = TeamId.generate();
const foreignTeamId = TeamId.generate();

const caller = makeUser(callerId, "dale@example.com", "Dale");
const owner = makeUser(ownerId, "pat@example.com", "Pat");
const foreignOwner = makeUser(foreignOwnerId, "foreign@example.com", "Foreign Owner");

const protocolMeta = {
  [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
  [CLIENT_INFO_META_KEY]: { name: "adversarial-test-client", version: "1.0.0" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};

function makeUser(id: UserId, email: string, name: string): User {
  return User.reconstitute({
    id,
    email: Email.from(email),
    name,
    onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

class TestUserRepository implements UserRepository {
  constructor(private readonly users: User[]) {}

  findById(id: UserId): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    return Promise.resolve(this.users.filter((user) => ids.includes(user.id)));
  }

  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  save(): Promise<void> {
    throw new Error("Read-only SQLite fixture must not save a user");
  }
}

class TestTeamRepository implements TeamRepository {
  private readonly team = Team.reconstitute({
    id: teamId,
    ownerId,
    name: "Field Team",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [],
  });

  constructor(private readonly members: ReadonlySet<UserId>) {}

  findByMember(userId: UserId): Promise<Team | null> {
    return Promise.resolve(this.members.has(userId) ? this.team : null);
  }

  findById(id: TeamId): Promise<Team | null> {
    return Promise.resolve(id === teamId ? this.team : null);
  }

  save(): Promise<void> {
    throw new Error("Read-only SQLite fixture must not save a team");
  }
}

type SqlRow = Record<string, string | number | null>;

function sqliteD1(db: DatabaseSync): D1Database {
  return {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => {
        const statement = db.prepare(query);
        const params = values as Array<string | number | null>;
        return {
          all: () => Promise.resolve({ results: statement.all(...params) as SqlRow[] }),
          first: () => Promise.resolve((statement.get(...params) as SqlRow | undefined) ?? null),
          run: () => Promise.resolve(statement.run(...params)),
        };
      },
    }),
  } as unknown as D1Database;
}

function createSqlite(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL,
      name TEXT, onboarding_completed_at TEXT,
      notification_email TEXT, notification_email_verified_at TEXT
    );
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE team_members (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, joined_at TEXT NOT NULL, UNIQUE(team_id, user_id)
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      metadata TEXT NOT NULL, archived_at TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, shared_team_id TEXT, revision INTEGER
    );
    CREATE TABLE maintenance_tasks (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      title TEXT NOT NULL, interval_value INTEGER NOT NULL, interval_unit TEXT NOT NULL,
      last_completed_date TEXT, next_due TEXT NOT NULL, created_at TEXT NOT NULL,
      schedule_seed_date TEXT, initial_last_completed_date TEXT,
      revision INTEGER NOT NULL DEFAULT 0, next_due_override TEXT
    );
    CREATE TABLE maintenance_records (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      title TEXT NOT NULL, performed_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
      task_id TEXT, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE activity_event_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE notification_event_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE notification_email_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  `);
  return db;
}

function insertUser(db: DatabaseSync, user: User): void {
  db.prepare(
    "INSERT INTO users (id, email, created_at, name, onboarding_completed_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    user.id,
    user.email,
    user.createdAt.toISOString(),
    user.name,
    user.onboardingCompletedAt?.toISOString() ?? null,
  );
}

function insertTeam(db: DatabaseSync): void {
  db.prepare("INSERT INTO teams (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)").run(
    teamId,
    ownerId,
    "Field Team",
    "2026-01-01T00:00:00.000Z",
  );
  for (const [index, userId] of [ownerId, callerId].entries()) {
    db.prepare(
      "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
    ).run(TeamId.generate(), teamId, userId, index === 0 ? "owner" : "member", todayUtc);
  }
}

type PropertyMetadata = {
  kind: "property";
  nickname?: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
};

function makeProperty(props: {
  id?: AssetId;
  owner?: UserId;
  name: string;
  street: string;
  city: string;
  archivedAt?: Date | null;
  sharedTeamId?: TeamId | null;
  revision: number;
}): Asset {
  const metadata: PropertyMetadata = {
    kind: "property",
    nickname: props.name,
    address: {
      street: props.street,
      city: props.city,
      state: "CO",
      postalCode: "80202",
      country: "US",
    },
  };
  return Asset.reconstitute({
    id: props.id ?? AssetId.generate(),
    ownerId: props.owner ?? ownerId,
    name: props.name,
    metadata,
    archivedAt: props.archivedAt ?? null,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-20T12:00:00.000Z"),
    sharedTeamId: props.sharedTeamId ?? null,
    revision: props.revision,
  });
}

function insertAsset(db: DatabaseSync, asset: Asset): void {
  db.prepare(
    `
    INSERT INTO assets
      (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    asset.id,
    asset.ownerId,
    asset.name,
    asset.type,
    JSON.stringify(asset.metadata),
    asset.archivedAt?.toISOString() ?? null,
    asset.createdAt.toISOString(),
    asset.updatedAt.toISOString(),
    asset.sharedTeamId,
    asset.revision,
  );
}

function insertTask(
  db: DatabaseSync,
  props: {
    id?: MaintenanceTaskId;
    asset: Asset;
    title: string;
    nextDue: string;
    createdAt: string;
    revision: number;
  },
): MaintenanceTaskId {
  const id = props.id ?? MaintenanceTaskId.generate();
  db.prepare(
    `
    INSERT INTO maintenance_tasks
      (id, asset_id, owner_id, title, interval_value, interval_unit,
       last_completed_date, next_due, created_at, schedule_seed_date,
       initial_last_completed_date, revision, next_due_override)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `,
  ).run(
    id,
    props.asset.id,
    props.asset.ownerId,
    props.title,
    1,
    "month",
    "2026-08-25",
    props.nextDue,
    props.createdAt,
    "2026-08-25",
    "2026-08-25",
    props.revision,
  );
  return id;
}

function insertRecord(
  db: DatabaseSync,
  props: {
    id?: MaintenanceRecordId;
    asset: Asset;
    title: string;
    performedAt: string;
    notes: string | null;
    taskId: MaintenanceTaskId | null;
    createdAt: string;
    revision: number;
  },
): MaintenanceRecordId {
  const id = props.id ?? MaintenanceRecordId.generate();
  db.prepare(
    `
    INSERT INTO maintenance_records
      (id, asset_id, owner_id, title, performed_at, notes, created_at, task_id, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    props.asset.id,
    props.asset.ownerId,
    props.title,
    props.performedAt,
    props.notes,
    props.createdAt,
    props.taskId,
    props.revision,
  );
  return id;
}

type TaskReadHooks = {
  beforeAssetTaskRead?: () => void;
  beforeDashboardTaskRead?: () => void;
};

class HookedD1MaintenanceTaskRepository extends D1MaintenanceTaskRepository {
  constructor(
    db: D1Database,
    private readonly hooks: TaskReadHooks,
  ) {
    super(db);
  }

  override findByAsset(assetId: AssetId) {
    this.hooks.beforeAssetTaskRead?.();
    return super.findByAsset(assetId);
  }

  override findForVisibleActiveAssets(userId: UserId) {
    this.hooks.beforeDashboardTaskRead?.();
    return super.findForVisibleActiveAssets(userId);
  }
}

function createReadFixture(
  db: DatabaseSync,
  teamMembers: ReadonlySet<UserId> = new Set([callerId, ownerId]),
  taskReadHooks: TaskReadHooks = {},
) {
  const d1 = sqliteD1(db);
  const users = new TestUserRepository([caller, owner, foreignOwner]);
  const teams = new TestTeamRepository(teamMembers);
  const assets = new D1AssetRepository(d1);
  const tasks = new HookedD1MaintenanceTaskRepository(d1, taskReadHooks);
  const records = new D1MaintenanceRecordRepository(d1);
  const dates: UtcDateProvider = { today: () => todayUtc };
  const snoozes: TaskSnoozeReader = {
    snoozedUntilByTask: () => Promise.resolve(new Map()),
  };
  const dependencies: McpReadDependencies = {
    listAssets: new ListAssets(assets, users),
    getAsset: new GetAsset(assets, teams, users),
    getDashboard: new GetDashboard(assets, tasks, dates, users, snoozes),
    listMaintenanceTasks: new ListMaintenanceTasks(assets, teams, tasks),
    listMaintenanceRecords: new ListMaintenanceRecords(assets, teams, records),
  };
  return { dependencies };
}

function makeServer(
  dependencies: McpReadDependencies,
  scopes: readonly string[] = ["assets:read", "maintenance:read"],
): McpServer {
  const server = new McpServer({ name: "pineapple", version: "1.0.0" });
  registerReadTools(server, caller, dependencies, scopes);
  return server;
}

async function callTool(
  server: McpServer,
  name: string,
  arguments_: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const handler = createMcpHandler(() => server, { legacy: "reject", responseMode: "json" });
  const response = await handler.fetch(
    new Request("https://pineapple.txe.app/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-method": "tools/call",
        "mcp-protocol-version": "2026-07-28",
        "mcp-name": name,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: arguments_, _meta: protocolMeta },
      }),
    }),
  );
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Expected MCP JSON object response");
  }
  return body as Record<string, unknown>;
}

function mcpResult(body: Record<string, unknown>): Record<string, unknown> {
  const result = body.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Expected MCP result object");
  }
  return result as Record<string, unknown>;
}

function structuredResult(body: Record<string, unknown>): Record<string, unknown> {
  const structured = mcpResult(body).structuredContent;
  if (typeof structured !== "object" || structured === null || Array.isArray(structured)) {
    throw new Error("Expected structured result");
  }
  return structured as Record<string, unknown>;
}

function readableResult(body: Record<string, unknown>): string {
  const content = mcpResult(body).content;
  if (!Array.isArray(content)) throw new Error("Expected MCP result content");
  const first: unknown = content[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error("Expected MCP text content");
  }
  const text = (first as Record<string, unknown>).text;
  if (typeof text !== "string") throw new Error("Expected MCP text result");
  return text;
}

function resultArray(object: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = object[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "object" || item === null)) {
    throw new Error(`Expected ${key} array`);
  }
  return value as Array<Record<string, unknown>>;
}

function databaseSnapshot(db: DatabaseSync): string {
  const tables = [
    "users",
    "teams",
    "team_members",
    "assets",
    "maintenance_tasks",
    "maintenance_records",
    "activity_event_outbox",
    "notification_event_outbox",
    "notification_email_outbox",
  ];
  return JSON.stringify(
    tables.map((table) => ({
      table,
      rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    })),
  );
}

describe("MCP read adversarial contract", () => {
  it("reads owner, shared, archived, foreign, and empty contexts through SQLite repositories", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertUser(db, owner);
      insertUser(db, foreignOwner);
      insertTeam(db);
      const owned = makeProperty({
        name: "Owned Cabin",
        street: "11 Own Road",
        city: "Denver",
        owner: callerId,
        revision: 8,
      });
      const shared = makeProperty({
        name: "Shared Cabin",
        street: "22 Shared Road",
        city: "Boulder",
        sharedTeamId: teamId,
        revision: 9,
      });
      const archived = makeProperty({
        name: "Archived Cabin",
        street: "33 Archive Road",
        city: "Golden",
        owner: callerId,
        archivedAt: new Date("2026-09-01T12:00:00.000Z"),
        revision: 10,
      });
      const foreign = makeProperty({
        name: "Foreign Cabin",
        street: "44 Private Road",
        city: "Aurora",
        owner: foreignOwnerId,
        sharedTeamId: foreignTeamId,
        revision: 11,
      });
      const empty = makeProperty({
        name: "Empty Cabin",
        street: "55 Quiet Road",
        city: "Arvada",
        owner: callerId,
        revision: 12,
      });
      for (const asset of [owned, shared, archived, foreign, empty]) insertAsset(db, asset);

      const sharedTaskId = insertTask(db, {
        asset: shared,
        title: "Shared inspection",
        nextDue: "2026-09-27",
        createdAt: "2026-08-26T12:00:00.000Z",
        revision: 3,
      });
      const archivedTaskId = insertTask(db, {
        asset: archived,
        title: "Archived inspection",
        nextDue: "2026-09-20",
        createdAt: "2026-08-27T12:00:00.000Z",
        revision: 4,
      });
      const sharedRecordId = insertRecord(db, {
        asset: shared,
        title: "Shared repair",
        performedAt: "2026-09-20",
        notes: "Replaced the valve.",
        taskId: sharedTaskId,
        createdAt: "2026-09-20T12:00:00.000Z",
        revision: 6,
      });
      const sharedOlderRecordId = insertRecord(db, {
        asset: shared,
        title: "Shared inspection",
        performedAt: "2026-09-18",
        notes: null,
        taskId: null,
        createdAt: "2026-09-18T12:00:00.000Z",
        revision: 5,
      });
      const archivedRecordId = insertRecord(db, {
        asset: archived,
        title: "Archived repair",
        performedAt: "2026-08-30",
        notes: "History remains readable.",
        taskId: archivedTaskId,
        createdAt: "2026-08-30T12:00:00.000Z",
        revision: 7,
      });
      db.prepare("INSERT INTO activity_event_outbox (id, payload) VALUES (?, ?)").run(
        "activity-baseline",
        "retain activity outbox row",
      );
      db.prepare("INSERT INTO notification_event_outbox (id, payload) VALUES (?, ?)").run(
        "notification-baseline",
        "retain notification outbox row",
      );
      db.prepare("INSERT INTO notification_email_outbox (id, payload) VALUES (?, ?)").run(
        "email-baseline",
        "retain email outbox row",
      );

      const { dependencies } = createReadFixture(db);
      const server = makeServer(dependencies);
      const before = databaseSnapshot(db);

      for (const asset of [owned, shared]) {
        const response = await callTool(server, "get_asset", { assetId: asset.id });
        expect(mcpResult(response).isError).not.toBe(true);
        expect(structuredResult(response).asset).toMatchObject({
          id: asset.id,
          revision: asset.revision,
        });
      }

      const sharedContext = structuredResult(
        await callTool(server, "get_asset_maintenance", { assetId: shared.id }),
      );
      expect(sharedContext.asset).toMatchObject({ id: shared.id, revision: 9 });
      const sharedTasks = resultArray(sharedContext, "maintenanceTasks");
      expect(sharedTasks).toHaveLength(1);
      expect(sharedTasks[0]).toMatchObject({
        id: sharedTaskId,
        assetId: shared.id,
        revision: 3,
      });
      const sharedRecords = resultArray(sharedContext, "maintenanceRecords");
      expect(sharedRecords).toHaveLength(2);
      expect(sharedRecords).toEqual([
        expect.objectContaining({
          id: sharedRecordId,
          assetId: shared.id,
          revision: 6,
          taskId: sharedTaskId,
        }),
        expect.objectContaining({
          id: sharedOlderRecordId,
          assetId: shared.id,
          revision: 5,
          taskId: null,
        }),
      ]);

      const archivedContext = structuredResult(
        await callTool(server, "get_asset_maintenance", { assetId: archived.id }),
      );
      expect(archivedContext.asset).toMatchObject({ id: archived.id, revision: 10 });
      expect(resultArray(archivedContext, "maintenanceTasks")).toEqual([
        expect.objectContaining({ id: archivedTaskId, assetId: archived.id, revision: 4 }),
      ]);
      expect(resultArray(archivedContext, "maintenanceRecords")).toEqual([
        expect.objectContaining({ id: archivedRecordId, assetId: archived.id, revision: 7 }),
      ]);

      const emptyContext = structuredResult(
        await callTool(server, "get_asset_maintenance", { assetId: empty.id }),
      );
      expect(emptyContext.asset).toMatchObject({ id: empty.id, revision: 12 });
      expect(emptyContext.maintenanceTasks).toEqual([]);
      expect(emptyContext.maintenanceRecords).toEqual([]);

      for (const toolName of ["get_asset", "get_asset_maintenance"]) {
        const denied = await callTool(server, toolName, { assetId: foreign.id });
        expect(mcpResult(denied).isError).toBe(true);
        expect(JSON.stringify(denied)).not.toContain("Foreign Cabin");
        expect(JSON.stringify(denied)).not.toContain("44 Private Road");
      }

      expect(databaseSnapshot(db)).toBe(before);
    } finally {
      db.close();
    }
  });

  it("rechecks cached maintenance scopes and rejects unknown inputs on both maintenance reads", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertTeam(db);
      const property = makeProperty({
        name: "Scope Cabin",
        street: "66 Guard Road",
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const { dependencies } = createReadFixture(db);
      const scopes = ["assets:read", "maintenance:read"];
      const server = makeServer(dependencies, scopes);
      const dashboard = vi.spyOn(dependencies.getDashboard, "execute");
      const taskList = vi.spyOn(dependencies.listMaintenanceTasks, "execute");
      const recordList = vi.spyOn(dependencies.listMaintenanceRecords, "execute");

      scopes.splice(scopes.indexOf("maintenance:read"), 1);
      for (const [name, args] of [
        ["get_due_maintenance", {}],
        ["get_asset_maintenance", { assetId: property.id }],
      ] as const) {
        const denied = await callTool(server, name, args);
        expect(mcpResult(denied).isError).toBe(true);
      }
      expect(dashboard).not.toHaveBeenCalled();
      expect(taskList).not.toHaveBeenCalled();
      expect(recordList).not.toHaveBeenCalled();

      scopes.push("maintenance:read");
      dashboard.mockClear();
      taskList.mockClear();
      recordList.mockClear();
      for (const [name, args] of [
        ["get_due_maintenance", { userId: callerId }],
        ["get_asset_maintenance", { assetId: property.id, ownerId: callerId }],
      ] as const) {
        const rejected = await callTool(server, name, args);
        expect(mcpResult(rejected).isError).toBe(true);
      }
      expect(dashboard).not.toHaveBeenCalled();
      expect(taskList).not.toHaveBeenCalled();
      expect(recordList).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("orders equal-urgency, equal-date due rows by producer creation time", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertTeam(db);
      const property = makeProperty({
        name: "Queue Cabin",
        street: "77 Queue Road",
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const overdueId = insertTask(db, {
        asset: property,
        title: "Overdue task",
        nextDue: "2026-09-24",
        createdAt: "2026-09-15T12:00:00.000Z",
        revision: 1,
      });
      const todayLaterCreatedId = insertTask(db, {
        asset: property,
        title: "Today later created",
        nextDue: todayUtc,
        createdAt: "2026-09-12T12:00:00.000Z",
        revision: 3,
      });
      const todayEarlierCreatedId = insertTask(db, {
        asset: property,
        title: "Today earlier created",
        nextDue: todayUtc,
        createdAt: "2026-09-10T12:00:00.000Z",
        revision: 2,
      });
      const soonId = insertTask(db, {
        asset: property,
        title: "Soon task",
        nextDue: "2026-09-28",
        createdAt: "2026-09-08T12:00:00.000Z",
        revision: 4,
      });
      insertTask(db, {
        asset: property,
        title: "Ok task",
        nextDue: "2026-10-10",
        createdAt: "2026-09-07T12:00:00.000Z",
        revision: 5,
      });
      const { dependencies } = createReadFixture(db);
      const response = await callTool(makeServer(dependencies), "get_due_maintenance");
      const structured = structuredResult(response);
      expect(structured.todayUtc).toBe(todayUtc);
      expect(resultArray(structured, "tasks").map((task) => task.taskId)).toEqual([
        overdueId,
        todayEarlierCreatedId,
        todayLaterCreatedId,
        soonId,
      ]);
      expect(resultArray(structured, "tasks").map((task) => task.status)).toEqual([
        "overdue",
        "soon",
        "soon",
        "soon",
      ]);
    } finally {
      db.close();
    }
  });

  it("returns a safe tool failure without leaking dependency error text", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertTeam(db);
      const property = makeProperty({
        name: "Failure Cabin",
        street: "88 Failure Road",
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const { dependencies } = createReadFixture(db);
      vi.spyOn(dependencies.getDashboard, "execute").mockRejectedValue(
        new Error("D1_ERROR: failed at 88 Failure Road; SELECT * FROM assets"),
      );

      const failed = await callTool(makeServer(dependencies), "get_due_maintenance");
      expect(mcpResult(failed).isError).toBe(true);
      expect(JSON.stringify(failed)).not.toContain("88 Failure Road");
      expect(JSON.stringify(failed)).not.toContain("D1_ERROR");
      expect(JSON.stringify(failed)).not.toContain("SELECT * FROM assets");
    } finally {
      db.close();
    }
  });

  it("redacts the street current when asset metadata changes during context loading", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertTeam(db);
      const oldStreet = "123 Old Road";
      const currentStreet = "456 New Lane";
      const property = makeProperty({
        name: "Race Cabin",
        street: oldStreet,
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const taskId = insertTask(db, {
        asset: property,
        title: `Inspect ${oldStreet}`,
        nextDue: "2026-09-25",
        createdAt: "2026-09-01T12:00:00.000Z",
        revision: 2,
      });
      insertRecord(db, {
        asset: property,
        title: "Repair entry",
        performedAt: "2026-09-20",
        notes: `Work performed at ${oldStreet}`,
        taskId,
        createdAt: "2026-09-20T12:00:00.000Z",
        revision: 3,
      });
      let changed = false;
      const changePropertyBetweenReads = () => {
        if (changed) return;
        changed = true;
        const original = property.metadata as PropertyMetadata;
        const updated: PropertyMetadata = {
          ...original,
          address: { ...original.address, street: currentStreet, city: "Boulder" },
        };
        db.prepare("UPDATE assets SET metadata = ?, revision = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(updated),
          2,
          "2026-09-26T12:00:00.000Z",
          property.id,
        );
        db.prepare("UPDATE maintenance_tasks SET title = ? WHERE id = ?").run(
          `Inspect ${currentStreet}`,
          taskId,
        );
        db.prepare("UPDATE maintenance_records SET notes = ? WHERE task_id = ?").run(
          `Work performed at ${currentStreet}`,
          taskId,
        );
      };
      const { dependencies } = createReadFixture(db, new Set([callerId, ownerId]), {
        beforeAssetTaskRead: changePropertyBetweenReads,
      });
      const server = makeServer(dependencies);
      const response = await callTool(server, "get_asset_maintenance", { assetId: property.id });

      expect(changed).toBe(true);
      expect(mcpResult(response).isError).toBe(true);
      expect(JSON.stringify(response)).not.toContain(oldStreet);
      expect(JSON.stringify(response)).not.toContain(currentStreet);

      const retry = await callTool(server, "get_asset_maintenance", { assetId: property.id });
      expect(mcpResult(retry).isError).not.toBe(true);
      const retriedContext = structuredResult(retry);
      expect(retriedContext.asset).toMatchObject({
        revision: 2,
        metadata: { city: "Boulder" },
      });
      expect(JSON.stringify(retriedContext)).not.toContain(currentStreet);
      expect(readableResult(retry)).not.toContain(currentStreet);
    } finally {
      db.close();
    }
  });

  it("redacts a property street changed between dashboard asset and task reads", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertTeam(db);
      const oldStreet = "789 Old Drive";
      const currentStreet = "654 New Court";
      const property = makeProperty({
        name: "Dashboard Race Cabin",
        street: oldStreet,
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const taskId = insertTask(db, {
        asset: property,
        title: `Inspect ${oldStreet}`,
        nextDue: "2026-09-25",
        createdAt: "2026-09-01T12:00:00.000Z",
        revision: 2,
      });
      let changed = false;
      const changePropertyBetweenReads = () => {
        if (changed) return;
        changed = true;
        const original = property.metadata as PropertyMetadata;
        const updated: PropertyMetadata = {
          ...original,
          address: { ...original.address, street: currentStreet, city: "Boulder" },
        };
        db.prepare("UPDATE assets SET metadata = ?, revision = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(updated),
          2,
          "2026-09-26T12:00:00.000Z",
          property.id,
        );
        db.prepare("UPDATE maintenance_tasks SET title = ? WHERE id = ?").run(
          `Inspect ${currentStreet}`,
          taskId,
        );
      };
      const { dependencies } = createReadFixture(db, new Set([callerId, ownerId]), {
        beforeDashboardTaskRead: changePropertyBetweenReads,
      });
      const response = await callTool(makeServer(dependencies), "get_due_maintenance");

      expect(changed).toBe(true);
      expect(JSON.stringify(structuredResult(response))).not.toContain(currentStreet);
      expect(readableResult(response)).not.toContain(currentStreet);
    } finally {
      db.close();
    }
  });

  it("redacts a known street literal when it is repeated as allowed locality text", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertUser(db, owner);
      insertTeam(db);
      const collision = "123 Main Street";
      const property = makeProperty({
        name: collision,
        street: collision,
        city: collision,
        owner: callerId,
        revision: 4,
      });
      insertAsset(db, property);
      insertTask(db, {
        asset: property,
        title: `Inspect ${collision}`,
        nextDue: "2026-09-25",
        createdAt: "2026-09-01T12:00:00.000Z",
        revision: 5,
      });
      const { dependencies } = createReadFixture(db);
      const server = makeServer(dependencies);

      for (const [name, args] of [
        ["get_asset", { assetId: property.id }],
        ["get_asset_maintenance", { assetId: property.id }],
      ] as const) {
        const body = await callTool(server, name, args);
        expect(JSON.stringify(structuredResult(body))).not.toContain(collision);
        expect(readableResult(body)).not.toContain(collision);
      }
    } finally {
      db.close();
    }
  });

  it("uses the current property's locality and street literal on each successive context read", async () => {
    const db = createSqlite();
    try {
      insertUser(db, caller);
      insertUser(db, owner);
      insertTeam(db);
      const oldStreet = "123 Old Road";
      const currentStreet = "456 New Lane";
      const property = makeProperty({
        name: "Cabin",
        street: oldStreet,
        city: "Denver",
        owner: callerId,
        revision: 1,
      });
      insertAsset(db, property);
      const taskId = insertTask(db, {
        asset: property,
        title: `Inspect ${oldStreet}`,
        nextDue: "2026-09-25",
        createdAt: "2026-09-01T12:00:00.000Z",
        revision: 2,
      });
      insertRecord(db, {
        asset: property,
        title: "Repair entry",
        performedAt: "2026-09-20",
        notes: `Work performed at ${oldStreet}`,
        taskId,
        createdAt: "2026-09-20T12:00:00.000Z",
        revision: 3,
      });
      const { dependencies } = createReadFixture(db);
      const server = makeServer(dependencies);

      const first = await callTool(server, "get_asset_maintenance", { assetId: property.id });
      expect(readableResult(first)).not.toContain(oldStreet);
      expect(JSON.stringify(structuredResult(first))).not.toContain(oldStreet);
      expect(readableResult(first)).toContain("Denver, CO");

      const originalMetadata = property.metadata as PropertyMetadata;
      const changedMetadata: PropertyMetadata = {
        ...originalMetadata,
        address: {
          ...originalMetadata.address,
          street: currentStreet,
          city: "Boulder",
        },
      };
      db.prepare("UPDATE assets SET metadata = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(changedMetadata),
        "2026-09-26T12:00:00.000Z",
        property.id,
      );
      db.prepare("UPDATE maintenance_tasks SET title = ? WHERE id = ?").run(
        `Inspect ${currentStreet}`,
        taskId,
      );
      db.prepare("UPDATE maintenance_records SET notes = ? WHERE task_id = ?").run(
        `Work performed at ${currentStreet}`,
        taskId,
      );

      const second = await callTool(server, "get_asset_maintenance", { assetId: property.id });
      expect(readableResult(second)).not.toContain(currentStreet);
      expect(JSON.stringify(structuredResult(second))).not.toContain(currentStreet);
      expect(readableResult(second)).toContain("Boulder, CO");
    } finally {
      db.close();
    }
  });
});
