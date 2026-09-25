import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { AssetId, Email, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { ListAssets } from "../../application/usecases/ListAssets.ts";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { D1AssetRepository } from "../persistence/D1AssetRepository.ts";
import { createAssetMcpServer, createAssetMcpServerFactory } from "./McpAssetServer.ts";

const requesterId = UserId.generate();
const teammateId = UserId.generate();
const teamId = TeamId.generate();
const requester = User.reconstitute({
  id: requesterId,
  email: Email.from("dale@example.com"),
  name: "Dale",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

class AssetRepositoryFake implements AssetRepository {
  requestedUserId: UserId | null = null;
  saveCalls = 0;

  constructor(private readonly assets: Asset[]) {}

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    this.requestedUserId = userId;
    return Promise.resolve(this.assets);
  }

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    this.saveCalls++;
    return Promise.resolve();
  }
}

class UserRepositoryFake implements UserRepository {
  constructor(private readonly users: User[]) {}

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    return Promise.resolve(this.users.filter((user) => ids.includes(user.id)));
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

function asset(props: {
  name: string;
  ownerId?: UserId;
  sharedTeamId?: TeamId | null;
  archivedAt?: Date | null;
  metadata:
    | { kind: "vehicle"; make: string; model: string; year: number; vin?: string }
    | {
        kind: "property";
        nickname?: string;
        address: {
          street: string;
          city: string;
          state: string;
          postalCode: string;
          country: string;
        };
      }
    | {
        kind: "equipment";
        manufacturer?: string;
        modelNumber?: string;
        serialNumber?: string;
      };
}): Asset {
  return Asset.reconstitute({
    id: AssetId.generate(),
    ownerId: props.ownerId ?? requesterId,
    name: props.name,
    metadata: props.metadata,
    archivedAt: props.archivedAt ?? null,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-02T12:00:00.000Z"),
    sharedTeamId: props.sharedTeamId ?? null,
  });
}

const requestMeta = {
  [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
  [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function mcpRequest(
  listAssets: ListAssets,
  method: "tools/list" | "tools/call",
  params: Record<string, unknown>,
  caller: User = requester,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const handler = createMcpHandler(() => createAssetMcpServer(caller, listAssets), {
    legacy: "reject",
    responseMode: "json",
  });
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
  if (!isRecord(body)) {
    throw new Error("Expected an MCP JSON object response");
  }

  return {
    status: response.status,
    body,
  };
}

function d1OverSqlite(sqlite: DatabaseSync): D1Database {
  return {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => {
        const statement = sqlite.prepare(query);
        const params = values as Array<string | null>;
        return {
          all: () => Promise.resolve({ results: statement.all(...params) }),
          first: () => Promise.resolve(statement.get(...params) ?? null),
        };
      },
    }),
  } as unknown as D1Database;
}

describe("Pineapple MCP asset server", () => {
  it("derives its user only from the verified token subject", async () => {
    const resolveUser = vi.fn().mockResolvedValue(requester);
    const createListAssets = vi
      .fn()
      .mockReturnValue(new ListAssets(new AssetRepositoryFake([]), new UserRepositoryFake([])));
    const onAuthenticated = vi.fn();
    const factory = createAssetMcpServerFactory({
      resolveUser,
      createListAssets,
      onAuthenticated,
    });

    await factory({
      era: "modern",
      authInfo: {
        token: "never-forwarded",
        clientId: "chatgpt-client",
        scopes: ["assets:read"],
        extra: { sub: "better-auth-user-id" },
      },
    });

    expect(resolveUser).toHaveBeenCalledWith("better-auth-user-id");
    expect(createListAssets).toHaveBeenCalledWith(requester);
    expect(onAuthenticated).toHaveBeenCalledWith(requester);
  });

  it("advertises exactly one no-input, read-only list_assets tool", async () => {
    const response = await mcpRequest(
      new ListAssets(new AssetRepositoryFake([]), new UserRepositoryFake([])),
      "tools/list",
      {},
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: {
        tools: [
          {
            name: "list_assets",
            title: "List Pineapple assets",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
        ],
      },
    });
    expect(JSON.stringify(response.body)).toMatch(/assets.*vehicles.*equipment.*properties/i);
  });

  it("returns the caller's visible assets while redacting every property address value", async () => {
    const truck = asset({
      name: "Truck",
      metadata: {
        kind: "vehicle",
        make: "Ford",
        model: "F-150",
        year: 2020,
        vin: "1FTFW1E50LFA00001",
      },
    });
    const cabin = asset({
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
    });
    const generator = asset({
      name: "Generator",
      ownerId: teammateId,
      sharedTeamId: teamId,
      metadata: {
        kind: "equipment",
        manufacturer: "Honda",
        modelNumber: "EU2200i",
        serialNumber: "EAMT-1234567",
      },
    });
    const assets = new AssetRepositoryFake([truck, cabin, generator]);
    const teammate = User.reconstitute({
      id: teammateId,
      email: Email.from("pat@example.com"),
      name: "Pat",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await mcpRequest(
      new ListAssets(assets, new UserRepositoryFake([teammate])),
      "tools/call",
      { name: "list_assets", arguments: {} },
    );

    expect(response.status).toBe(200);
    const result = (response.body.result ?? {}) as {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ type: string; text?: string }>;
    };
    expect(result.structuredContent).toEqual({
      assets: [
        {
          id: truck.id,
          name: "Truck",
          type: "vehicle",
          metadata: {
            kind: "vehicle",
            make: "Ford",
            model: "F-150",
            year: 2020,
            vin: "1FTFW1E50LFA00001",
          },
          archivedAt: null,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-02T12:00:00.000Z",
          sharing: { scope: "personal", isOwner: true },
        },
        {
          id: cabin.id,
          type: "property",
          metadata: { kind: "property" },
          archivedAt: null,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-02T12:00:00.000Z",
          sharing: { scope: "personal", isOwner: true },
        },
        {
          id: generator.id,
          name: "Generator",
          type: "equipment",
          metadata: {
            kind: "equipment",
            manufacturer: "Honda",
            modelNumber: "EU2200i",
            serialNumber: "EAMT-1234567",
          },
          archivedAt: null,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-02T12:00:00.000Z",
          sharing: { scope: "team", isOwner: false, ownerDisplayName: "Pat" },
        },
      ],
      counts: { all: 3, vehicle: 1, equipment: 1, property: 1 },
    });
    expect(assets.requestedUserId).toBe(requesterId);
    expect(assets.saveCalls).toBe(0);
    expect(truck.pullEvents()).toEqual([]);
    expect(cabin.pullEvents()).toEqual([]);
    expect(generator.pullEvents()).toEqual([]);

    const readable = result.content?.[0]?.text ?? "";
    expect(JSON.parse(readable)).toEqual(result.structuredContent);
    for (const sensitive of ["address", "123 Secret Road", "Denver", "80202", "CO", "US"]) {
      expect(JSON.stringify(result.structuredContent)).not.toContain(sensitive);
      expect(readable).not.toContain(sensitive);
    }
  });

  it("matches the real D1 visibility query for owned, shared, archived, unshared, and foreign assets", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
          type TEXT NOT NULL, metadata TEXT NOT NULL, archived_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, shared_team_id TEXT
        );
        CREATE TABLE team_members (team_id TEXT NOT NULL, user_id TEXT NOT NULL);
      `);
      sqlite
        .prepare("INSERT INTO team_members (team_id, user_id) VALUES (?, ?)")
        .run(teamId, requesterId);

      const otherTeamId = TeamId.generate();
      const foreignUserId = UserId.generate();
      const owned = asset({
        name: "Owned truck",
        metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      });
      const archived = asset({
        name: "Archived truck",
        archivedAt: new Date("2026-06-03T12:00:00.000Z"),
        metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      });
      const shared = asset({
        name: "Shared generator",
        ownerId: teammateId,
        sharedTeamId: teamId,
        metadata: { kind: "equipment", manufacturer: "Honda" },
      });
      const unshared = asset({
        name: "Private mower",
        ownerId: teammateId,
        metadata: { kind: "equipment", manufacturer: "Toro" },
      });
      const foreign = asset({
        name: "Foreign property",
        ownerId: foreignUserId,
        sharedTeamId: otherTeamId,
        metadata: {
          kind: "property",
          nickname: "123 Private Street",
          address: {
            street: "123 Private Street",
            city: "Denver",
            state: "CO",
            postalCode: "80202",
            country: "US",
          },
        },
      });
      const insert = sqlite.prepare(`
        INSERT INTO assets
          (id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of [owned, archived, shared, unshared, foreign]) {
        insert.run(
          item.id,
          item.ownerId,
          item.name,
          item.type,
          JSON.stringify(item.metadata),
          item.archivedAt?.toISOString() ?? null,
          item.createdAt.toISOString(),
          item.updatedAt.toISOString(),
          item.sharedTeamId,
        );
      }

      const teammate = User.reconstitute({
        id: teammateId,
        email: Email.from("pat@example.com"),
        name: "Pat",
        onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      const listAssets = new ListAssets(
        new D1AssetRepository(d1OverSqlite(sqlite)),
        new UserRepositoryFake([requester, teammate]),
      );

      const forRequester = await mcpRequest(listAssets, "tools/call", {
        name: "list_assets",
        arguments: {},
      });
      const requesterResult = forRequester.body.result as {
        structuredContent: { assets: Array<{ id: string }>; counts: Record<string, number> };
      };
      expect(requesterResult.structuredContent.assets.map((item) => item.id)).toEqual([
        owned.id,
        shared.id,
      ]);
      expect(requesterResult.structuredContent.counts).toEqual({
        all: 2,
        vehicle: 1,
        equipment: 1,
        property: 0,
      });

      const forTeammate = await mcpRequest(
        listAssets,
        "tools/call",
        { name: "list_assets", arguments: {} },
        teammate,
      );
      const teammateResult = forTeammate.body.result as {
        structuredContent: { assets: Array<{ id: string }>; counts: Record<string, number> };
      };
      expect(teammateResult.structuredContent.assets.map((item) => item.id)).toEqual([
        shared.id,
        unshared.id,
      ]);
      expect(teammateResult.structuredContent.counts).toEqual({
        all: 2,
        vehicle: 0,
        equipment: 2,
        property: 0,
      });
    } finally {
      sqlite.close();
    }
  });

  it("returns an empty inventory with zero category counts", async () => {
    const response = await mcpRequest(
      new ListAssets(new AssetRepositoryFake([]), new UserRepositoryFake([])),
      "tools/call",
      { name: "list_assets", arguments: {} },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: {
        structuredContent: {
          assets: [],
          counts: { all: 0, vehicle: 0, equipment: 0, property: 0 },
        },
      },
    });
  });

  it("rejects caller identity input before listing assets", async () => {
    const assets = new AssetRepositoryFake([]);
    const response = await mcpRequest(
      new ListAssets(assets, new UserRepositoryFake([])),
      "tools/call",
      { name: "list_assets", arguments: { userId: UserId.generate() } },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
          },
        ],
      },
    });
    expect(JSON.stringify(response.body)).toMatch(/invalid arguments.*userId/i);
    expect(assets.requestedUserId).toBeNull();
  });
});
