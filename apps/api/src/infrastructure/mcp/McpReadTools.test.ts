import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
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
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../domain/maintenance/MaintenanceRecordRepository.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { D1AssetRepository } from "../persistence/D1AssetRepository.ts";
import { registerReadTools, type McpReadDependencies } from "./McpReadTools.ts";

const todayUtc = "2026-09-25";
const callerId = UserId.generate();
const propertyOwnerId = UserId.generate();
const foreignOwnerId = UserId.generate();
const teamId = TeamId.generate();
const foreignTeamId = TeamId.generate();
const caller = User.reconstitute({
  id: callerId,
  email: Email.from("dale@example.com"),
  name: "Dale",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});
const propertyOwner = User.reconstitute({
  id: propertyOwnerId,
  email: Email.from("pat@example.com"),
  name: "123 Secret Road",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});
const foreignOwner = User.reconstitute({
  id: foreignOwnerId,
  email: Email.from("foreign@example.com"),
  name: "Foreign Owner",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

type Fixture = ReturnType<typeof fixture>;

class AssetRepositoryFake implements AssetRepository {
  saveCalls = 0;

  constructor(
    readonly assets: Asset[],
    private readonly teamMembers: ReadonlySet<UserId>,
  ) {}

  findById(id: AssetId): Promise<Asset | null> {
    return Promise.resolve(this.assets.find((asset) => asset.id === id) ?? null);
  }

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    return Promise.resolve(
      this.assets.filter(
        (asset) =>
          asset.ownerId === userId ||
          (asset.sharedTeamId === teamId && this.teamMembers.has(userId)),
      ),
    );
  }

  save(): Promise<void> {
    this.saveCalls++;
    return Promise.resolve();
  }
}

class TeamRepositoryFake implements TeamRepository {
  private readonly team = Team.reconstitute({
    id: teamId,
    ownerId: propertyOwnerId,
    name: "Field Team",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [],
  });

  constructor(private readonly teamMembers: ReadonlySet<UserId>) {}

  findByMember(userId: UserId): Promise<Team | null> {
    return Promise.resolve(this.teamMembers.has(userId) ? this.team : null);
  }

  findById(id: TeamId): Promise<Team | null> {
    return Promise.resolve(id === this.team.id ? this.team : null);
  }

  save(): Promise<void> {
    throw new Error("Read tests must not save a team");
  }
}

class UserRepositoryFake implements UserRepository {
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
    throw new Error("Read tests must not save a user");
  }
}

class MaintenanceTaskRepositoryFake implements MaintenanceTaskRepository {
  constructor(
    private readonly tasks: MaintenanceTask[],
    private readonly assets: AssetRepositoryFake,
  ) {}

  findByAsset(assetId: AssetId): Promise<MaintenanceTask[]> {
    return Promise.resolve(
      this.tasks
        .filter((task) => task.assetId === assetId)
        .sort((left, right) => left.nextDue.localeCompare(right.nextDue)),
    );
  }

  async findForVisibleActiveAssets(userId: UserId): Promise<MaintenanceTask[]> {
    const activeVisibleIds = new Set(
      (await this.assets.findVisibleTo(userId))
        .filter((asset) => asset.archivedAt === null)
        .map((asset) => asset.id),
    );
    return this.tasks
      .filter((task) => activeVisibleIds.has(task.assetId))
      .sort(
        (left, right) =>
          left.nextDue.localeCompare(right.nextDue) ||
          left.createdAt.toISOString().localeCompare(right.createdAt.toISOString()),
      );
  }

  findById(): Promise<MaintenanceTask | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    throw new Error("Read tests must not save a maintenance task");
  }

  delete(): Promise<void> {
    throw new Error("Read tests must not delete a maintenance task");
  }
}

class MaintenanceRecordRepositoryFake implements MaintenanceRecordRepository {
  constructor(private readonly records: MaintenanceRecord[]) {}

  findById(): Promise<MaintenanceRecord | null> {
    return Promise.resolve(null);
  }

  findByAsset(assetId: AssetId, ownerId: UserId): Promise<MaintenanceRecord[]> {
    return Promise.resolve(
      this.records
        .filter((record) => record.assetId === assetId && record.ownerId === ownerId)
        .sort(
          (left, right) =>
            right.performedAt.localeCompare(left.performedAt) ||
            right.createdAt.toISOString().localeCompare(left.createdAt.toISOString()),
        ),
    );
  }

  findByTask(): Promise<MaintenanceRecord[]> {
    return Promise.resolve([]);
  }

  save(): Promise<void> {
    throw new Error("Read tests must not save a maintenance record");
  }
}

function fixture(
  props: { assets?: Asset[]; tasks?: MaintenanceTask[]; records?: MaintenanceRecord[] } = {},
) {
  const teamMembers = new Set<UserId>([callerId, propertyOwnerId]);
  const assets = props.assets ?? createAssets();
  const assetRepository = new AssetRepositoryFake(assets, teamMembers);
  const users = new UserRepositoryFake([caller, propertyOwner, foreignOwner]);
  const teams = new TeamRepositoryFake(teamMembers);
  const tasks = props.tasks ?? createTasks(assets);
  const records = props.records ?? createRecords(assets, tasks);
  const taskRepository = new MaintenanceTaskRepositoryFake(tasks, assetRepository);
  const recordRepository = new MaintenanceRecordRepositoryFake(records);
  const dates: UtcDateProvider = { today: () => todayUtc };
  const snoozes: TaskSnoozeReader = {
    snoozedUntilByTask: () => Promise.resolve(new Map()),
  };

  const deps: McpReadDependencies = {
    listAssets: new ListAssets(assetRepository, users),
    getAsset: new GetAsset(assetRepository, teams, users),
    getDashboard: new GetDashboard(assetRepository, taskRepository, dates, users, snoozes),
    listMaintenanceTasks: new ListMaintenanceTasks(assetRepository, teams, taskRepository),
    listMaintenanceRecords: new ListMaintenanceRecords(assetRepository, teams, recordRepository),
  };

  return {
    deps,
    assets,
    tasks,
    records,
    assetRepository,
  };
}

function createAssets() {
  const truck = Asset.reconstitute({
    id: AssetId.generate(),
    ownerId: callerId,
    name: "Truck",
    metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    archivedAt: null,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-20T12:00:00.000Z"),
    revision: 3,
  });
  const property = Asset.reconstitute({
    id: AssetId.generate(),
    ownerId: propertyOwnerId,
    name: "123 Secret Road",
    metadata: {
      kind: "property",
      nickname: "123 Secret Road",
      address: {
        street: "123 Secret Road",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        country: "US",
      },
    },
    archivedAt: null,
    createdAt: new Date("2026-01-02T12:00:00.000Z"),
    updatedAt: new Date("2026-09-21T12:00:00.000Z"),
    sharedTeamId: teamId,
    revision: 7,
  });
  const archived = Asset.reconstitute({
    id: AssetId.generate(),
    ownerId: callerId,
    name: "555 Archive Place",
    metadata: {
      kind: "property",
      nickname: "555 Archive Place",
      address: {
        street: "555 Archive Place",
        city: "Boulder",
        state: "CO",
        postalCode: "80301",
        country: "US",
      },
    },
    archivedAt: new Date("2026-09-01T12:00:00.000Z"),
    createdAt: new Date("2026-01-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    revision: 2,
  });
  const foreign = Asset.reconstitute({
    id: AssetId.generate(),
    ownerId: foreignOwnerId,
    name: "999 Private Road",
    metadata: {
      kind: "property",
      nickname: "999 Private Road",
      address: {
        street: "999 Private Road",
        city: "Golden",
        state: "CO",
        postalCode: "80401",
        country: "US",
      },
    },
    archivedAt: null,
    createdAt: new Date("2026-01-04T12:00:00.000Z"),
    updatedAt: new Date("2026-09-02T12:00:00.000Z"),
    sharedTeamId: foreignTeamId,
    revision: 1,
  });
  return [truck, property, archived, foreign];
}

function createTasks(assets: Asset[]) {
  const truck = assets.find((asset) => asset.type === "vehicle");
  const property = assets.find(
    (asset) => asset.type === "property" && asset.sharedTeamId === teamId,
  );
  const archived = assets.find((asset) => asset.archivedAt !== null);
  if (!truck || !property || !archived) throw new Error("Fixture assets are incomplete");

  const makeTask = (props: {
    asset: Asset;
    title: string;
    nextDue: string;
    revision: number;
    createdAt?: string;
  }) =>
    MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: props.asset.id,
      ownerId: props.asset.ownerId,
      title: props.title,
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: "2026-08-25",
      nextDue: props.nextDue,
      createdAt: new Date(props.createdAt ?? "2026-08-25T12:00:00.000Z"),
      revision: props.revision,
    });

  return [
    makeTask({
      asset: property,
      title: "123 Secret Road: inspect the boiler",
      nextDue: "2026-09-24",
      revision: 11,
    }),
    makeTask({
      asset: property,
      title: "Address: 123 Secret filter",
      nextDue: "2026-09-25",
      revision: 12,
      createdAt: "2026-09-01T12:00:00.000Z",
    }),
    makeTask({
      asset: truck,
      title: "Rotate tires",
      nextDue: "2026-09-28",
      revision: 4,
    }),
    makeTask({
      asset: property,
      title: "Future property inspection",
      nextDue: "2026-10-10",
      revision: 13,
    }),
    makeTask({
      asset: archived,
      title: "Archived asset service",
      nextDue: "2026-09-23",
      revision: 2,
    }),
  ];
}

function createRecords(assets: Asset[], tasks: MaintenanceTask[]) {
  const property = assets.find(
    (asset) => asset.type === "property" && asset.sharedTeamId === teamId,
  );
  if (!property) throw new Error("Fixture property is missing");
  const linkedTask = tasks.find((task) => task.assetId === property.id);
  if (!linkedTask) throw new Error("Fixture property task is missing");

  return [
    MaintenanceRecord.reconstitute({
      id: MaintenanceRecordId.generate(),
      assetId: property.id,
      ownerId: property.ownerId,
      title: "Leak repair at 123 Secret Road",
      performedAt: "2026-09-20",
      notes: "Address is 123 Secret Road. Work complete.",
      taskId: linkedTask.id,
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
      revision: 9,
    }),
    MaintenanceRecord.reconstitute({
      id: MaintenanceRecordId.generate(),
      assetId: property.id,
      ownerId: property.ownerId,
      title: "Entry inspection",
      performedAt: "2026-09-18",
      notes: "123 Secret Rd repainted.",
      taskId: null,
      createdAt: new Date("2026-09-18T12:00:00.000Z"),
      revision: 5,
    }),
  ];
}

function d1OverSqlite(sqlite: DatabaseSync): D1Database {
  return {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => {
        const statement = sqlite.prepare(query);
        const parameters = values as Array<string | null>;
        return {
          all: () => Promise.resolve({ results: statement.all(...parameters) }),
          first: () => Promise.resolve(statement.get(...parameters) ?? null),
        };
      },
    }),
  } as unknown as D1Database;
}

const requestMeta = {
  [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
  [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeServer(
  readFixture: Fixture,
  scopes: readonly string[],
  user: User = caller,
): McpServer {
  const server = new McpServer({ name: "pineapple", version: "1.0.0" });
  registerReadTools(server, user, readFixture.deps, scopes);
  return server;
}

async function mcpRequest(
  readFixture: Fixture,
  method: "tools/list" | "tools/call",
  params: Record<string, unknown>,
  scopes: readonly string[] = ["assets:read", "maintenance:read"],
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = makeServer(readFixture, scopes);
  const handler = createMcpHandler(() => server, { legacy: "reject", responseMode: "json" });
  const response = await handler.fetch(
    new Request("https://pineapple.txe.app/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-method": method,
        "mcp-protocol-version": "2026-07-28",
        ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: { ...params, _meta: requestMeta },
      }),
    }),
  );
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected an MCP JSON object response");
  return { status: response.status, body };
}

function resultOf(response: { body: Record<string, unknown> }): Record<string, unknown> {
  const result = response.body.result;
  if (!isRecord(result)) throw new Error("Expected an MCP result object");
  return result;
}

function structuredOf(response: { body: Record<string, unknown> }): Record<string, unknown> {
  const result = resultOf(response).structuredContent;
  if (!isRecord(result)) throw new Error("Expected structured MCP content");
  return result;
}

function readableOf(response: { body: Record<string, unknown> }): string {
  const content = resultOf(response).content;
  if (!Array.isArray(content)) throw new Error("Expected MCP readable content");
  const first = (content as unknown[])[0];
  if (!isRecord(first) || typeof first.text !== "string") {
    throw new Error("Expected MCP readable text");
  }
  return first.text;
}

function stringField(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string") throw new Error(`Expected ${key} to be text`);
  return value;
}

describe("MCP focused read tools", () => {
  it("advertises exactly the tools granted by scopes with strict inputs and read-only annotations", async () => {
    const readFixture = fixture();
    const all = await mcpRequest(readFixture, "tools/list", {});
    const tools = resultOf(all).tools as Array<Record<string, unknown>>;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_assets",
      "get_asset",
      "get_due_maintenance",
      "get_asset_maintenance",
    ]);
    const listAssetsTool = tools.find((tool) => tool.name === "list_assets");
    const getAssetTool = tools.find((tool) => tool.name === "get_asset");
    for (const tool of [listAssetsTool, getAssetTool]) {
      expect(tool).toMatchObject({
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(tool?.inputSchema).toMatchObject({ additionalProperties: false });
    }
    expect(listAssetsTool?.inputSchema).toMatchObject({ properties: {} });
    for (const tool of tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }

    const assetsOnly = await mcpRequest(readFixture, "tools/list", {}, ["assets:read"]);
    expect(
      (resultOf(assetsOnly).tools as Array<{ name: string }>).map((tool) => tool.name),
    ).toEqual(["list_assets", "get_asset"]);
  });

  it("lists complete owned and team-shared active assets with revisions and property locality only", async () => {
    const readFixture = fixture();
    const response = await mcpRequest(readFixture, "tools/call", {
      name: "list_assets",
      arguments: {},
    });

    expect(response.status).toBe(200);
    const structured = structuredOf(response);
    const assets = structured.assets as Array<Record<string, unknown>>;
    expect(assets.map((asset) => asset.id)).toEqual([
      readFixture.assets[0]?.id,
      readFixture.assets[1]?.id,
    ]);
    expect(structured.counts).toEqual({ all: 2, vehicle: 1, property: 1, equipment: 0 });
    expect(assets[0]).toMatchObject({ name: "Truck", revision: 3 });
    expect(assets[1]).toMatchObject({
      id: readFixture.assets[1]?.id,
      revision: 7,
      metadata: {
        kind: "property",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        country: "US",
      },
      sharing: {
        scope: "team",
        isOwner: false,
      },
    });
    expect(stringField(assets[1] ?? {}, "label")).toContain("Denver, CO");
    expect(assets[1]).not.toHaveProperty("name");
    expect(assets[1]).not.toHaveProperty("metadata.address");
    expect(assets[1]).not.toHaveProperty("metadata.nickname");
    expect((assets[1]?.sharing as Record<string, unknown>).ownerDisplayName).not.toContain(
      "Secret",
    );
    expect(readFixture.assetRepository.saveCalls).toBe(0);
    expect(readFixture.assets.every((asset) => asset.pullEvents().length === 0)).toBe(true);

    const readable = readableOf(response);
    expect(JSON.parse(readable)).toEqual(structured);
    for (const privateValue of ["123 Secret Road", "123 Secret", "nickname"]) {
      expect(JSON.stringify(structured)).not.toContain(privateValue);
      expect(readable).not.toContain(privateValue);
    }
  });

  it("matches the real D1 visibility query for owned, shared, archived, unshared, and foreign assets", async () => {
    const readFixture = fixture();
    const [owned, shared, archived, foreign] = readFixture.assets;
    if (!owned || !shared || !archived || !foreign)
      throw new Error("Fixture assets are incomplete");
    const unshared = Asset.reconstitute({
      id: AssetId.generate(),
      ownerId: propertyOwnerId,
      name: "Owner only generator",
      metadata: { kind: "equipment", manufacturer: "Honda" },
      archivedAt: null,
      createdAt: new Date("2026-02-01T12:00:00.000Z"),
      updatedAt: new Date("2026-02-02T12:00:00.000Z"),
      revision: 0,
    });
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
          type TEXT NOT NULL, metadata TEXT NOT NULL, archived_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, shared_team_id TEXT,
          revision INTEGER
        );
        CREATE TABLE team_members (team_id TEXT NOT NULL, user_id TEXT NOT NULL);
      `);
      sqlite
        .prepare("INSERT INTO team_members (team_id, user_id) VALUES (?, ?)")
        .run(teamId, callerId);
      const insert = sqlite.prepare(`
        INSERT INTO assets
          (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const asset of [owned, shared, archived, unshared, foreign]) {
        insert.run(
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

      readFixture.deps.listAssets = new ListAssets(
        new D1AssetRepository(d1OverSqlite(sqlite)),
        new UserRepositoryFake([propertyOwner]),
      );
      const response = await mcpRequest(readFixture, "tools/call", {
        name: "list_assets",
        arguments: {},
      });
      const structured = structuredOf(response);
      const assets = structured.assets as Array<Record<string, unknown>>;
      expect(assets.map((asset) => asset.id).sort()).toEqual([owned.id, shared.id].sort());
      expect(structured.counts).toEqual({ all: 2, vehicle: 1, property: 1, equipment: 0 });
      expect(JSON.stringify(structured)).not.toContain("123 Secret Road");
      expect(JSON.parse(readableOf(response))).toEqual(structured);
    } finally {
      sqlite.close();
    }
  });

  it("returns an authorized asset, including archived details, while rejecting identity overrides", async () => {
    const readFixture = fixture();
    const property = readFixture.assets[1];
    if (!property) throw new Error("Fixture property is missing");

    const response = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset",
      arguments: { assetId: property.id },
    });
    const structured = structuredOf(response);
    const asset = structured.asset as Record<string, unknown>;
    expect(asset).toMatchObject({
      id: property.id,
      revision: 7,
      type: "property",
      metadata: { kind: "property", city: "Denver", state: "CO" },
    });
    expect(stringField(asset, "label")).toContain(property.id);
    expect(asset).not.toHaveProperty("name");
    expect(asset).not.toHaveProperty("metadata.address");
    expect(JSON.stringify(structured)).not.toContain("123 Secret Road");
    expect(readableOf(response)).not.toContain("123 Secret Road");

    const archived = readFixture.assets[2];
    if (!archived) throw new Error("Fixture archived asset is missing");
    const archivedResponse = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset",
      arguments: { assetId: archived.id },
    });
    expect((structuredOf(archivedResponse).asset as Record<string, unknown>).archivedAt).toBe(
      "2026-09-01T12:00:00.000Z",
    );
    const archivedContext = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset_maintenance",
      arguments: { assetId: archived.id },
    });
    expect(
      (structuredOf(archivedContext).maintenanceTasks as Array<Record<string, unknown>>).map(
        (task) => task.title,
      ),
    ).toEqual(["Archived asset service"]);

    const invalid = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset",
      arguments: { assetId: property.id, userId: UserId.generate() },
    });
    expect(resultOf(invalid).isError).toBe(true);
    expect(JSON.stringify(invalid.body)).toMatch(/invalid arguments.*userId/i);
  });

  it("returns only dashboard due rows in dashboard order, with server dates and current revisions", async () => {
    const readFixture = fixture();
    const response = await mcpRequest(readFixture, "tools/call", {
      name: "get_due_maintenance",
      arguments: {},
    });
    const structured = structuredOf(response);
    const dueItems = structured.tasks as Array<Record<string, unknown>>;

    expect(structured.todayUtc).toBe(todayUtc);
    expect(dueItems.map((item) => item.taskId)).toEqual([
      readFixture.tasks[0]?.id,
      readFixture.tasks[1]?.id,
      readFixture.tasks[2]?.id,
    ]);
    expect(dueItems.map((item) => item.status)).toEqual(["overdue", "soon", "soon"]);
    expect(dueItems.map((item) => item.daysDue)).toEqual([-1, 0, 3]);
    expect(dueItems.map((item) => item.taskRevision)).toEqual([11, 12, 4]);
    expect(dueItems.map((item) => item.assetRevision)).toEqual([7, 7, 3]);
    expect(dueItems[0]).toMatchObject({
      taskTitle: "[redacted address]: inspect the boiler",
      sharing: { scope: "team", isOwner: false },
    });
    expect(stringField(dueItems[0] ?? {}, "assetLabel")).toContain("Denver, CO");
    expect(dueItems[1]?.taskTitle).toBe("Address: [redacted address] filter");
    expect(JSON.stringify(structured)).not.toContain("123 Secret Road");
    expect(JSON.stringify(structured)).not.toContain("123 Secret");
    expect(readableOf(response)).not.toContain("123 Secret Road");
    expect(JSON.parse(readableOf(response))).toEqual(structured);
  });

  it("returns shared asset tasks and reverse-chronological records with all address-bearing text redacted", async () => {
    const readFixture = fixture();
    const property = readFixture.assets[1];
    if (!property) throw new Error("Fixture property is missing");
    const response = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset_maintenance",
      arguments: { assetId: property.id },
    });
    const structured = structuredOf(response);
    const asset = structured.asset as Record<string, unknown>;
    const tasks = structured.maintenanceTasks as Array<Record<string, unknown>>;
    const records = structured.maintenanceRecords as Array<Record<string, unknown>>;

    expect(asset).toMatchObject({ revision: 7 });
    expect(stringField(asset, "label")).toContain("Denver, CO");
    expect(tasks.map((task) => task.revision)).toEqual([11, 12, 13]);
    expect(records.map((record) => record.performedAt)).toEqual(["2026-09-20", "2026-09-18"]);
    expect(records.map((record) => record.revision)).toEqual([9, 5]);
    expect(records[0]?.taskId).toBe(tasks[0]?.id);
    expect(tasks[0]?.title).toBe("[redacted address]: inspect the boiler");
    expect(records[0]?.title).toBe("Leak repair at [redacted address]");
    expect(records[0]?.notes).toBe("Address is [redacted address]. Work complete.");
    expect(records[1]?.notes).toBe("[redacted address] repainted.");
    expect(readableOf(response)).not.toContain("123 Secret Road");
    expect(JSON.parse(readableOf(response))).toEqual(structured);
    expect(readFixture.assetRepository.saveCalls).toBe(0);
    expect(readFixture.tasks.every((task) => task.pullEvents().length === 0)).toBe(true);
    expect(readFixture.records.every((record) => record.pullEvents().length === 0)).toBe(true);
  });

  it("fails closed on foreign assets and enforces scopes again inside registered callbacks", async () => {
    const readFixture = fixture();
    const foreign = readFixture.assets[3];
    if (!foreign) throw new Error("Fixture foreign asset is missing");
    const denied = await mcpRequest(readFixture, "tools/call", {
      name: "get_asset_maintenance",
      arguments: { assetId: foreign.id },
    });
    expect(resultOf(denied).isError).toBe(true);
    expect(JSON.stringify(denied.body)).not.toContain("999 Private Road");

    const scopes = ["assets:read", "maintenance:read"];
    const dashboardCall = vi.spyOn(readFixture.deps.getDashboard, "execute");
    const server = makeServer(readFixture, scopes);
    scopes.splice(scopes.indexOf("maintenance:read"), 1);
    const handler = createMcpHandler(() => server, { legacy: "reject", responseMode: "json" });
    const response = await handler.fetch(
      new Request("https://pineapple.txe.app/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "mcp-method": "tools/call",
          "mcp-protocol-version": "2026-07-28",
          "mcp-name": "get_due_maintenance",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_due_maintenance", arguments: {}, _meta: requestMeta },
        }),
      }),
    );
    const body: unknown = await response.json();
    expect(isRecord(body) && isRecord(body.result) && body.result.isError).toBe(true);
    expect(dashboardCall).not.toHaveBeenCalled();
  });

  it("returns complete empty inventories and an empty due queue", async () => {
    const readFixture = fixture({ assets: [], tasks: [], records: [] });
    const assets = await mcpRequest(readFixture, "tools/call", {
      name: "list_assets",
      arguments: {},
    });
    expect(structuredOf(assets)).toMatchObject({
      assets: [],
      counts: { all: 0, vehicle: 0, property: 0, equipment: 0 },
    });

    const due = await mcpRequest(readFixture, "tools/call", {
      name: "get_due_maintenance",
      arguments: {},
    });
    expect(structuredOf(due)).toMatchObject({ todayUtc, tasks: [] });
  });
});
