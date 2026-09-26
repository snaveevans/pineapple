import { describe, expect, it, vi } from "vitest";
import {
  createMcpHandler,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { Email, UserId, ok } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import { createPineappleMcpServerFactory, mcpWritesEnabled } from "./McpAssetServer.ts";
import type { McpReadDependencies } from "./McpReadTools.ts";

const user = User.reconstitute({
  id: UserId.generate(),
  email: Email.from("operator@example.com"),
  name: "Operator",
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});
function setup(enabled = true) {
  const reads: McpReadDependencies = {
    listAssets: {
      execute: vi
        .fn()
        .mockResolvedValue(
          ok({ assets: [], counts: { all: 0, vehicle: 0, equipment: 0, property: 0 } }),
        ),
    },
    getAsset: { execute: vi.fn() },
    getDashboard: { execute: vi.fn() },
    listMaintenanceTasks: { execute: vi.fn() },
    listMaintenanceRecords: { execute: vi.fn() },
  };
  const operations = { execute: vi.fn() };
  const resolveUser = vi.fn().mockResolvedValue(user);
  const createReads = vi.fn().mockReturnValue(reads);
  const createOperations = vi.fn().mockReturnValue(operations);
  const onAuthenticated = vi.fn();
  const factory = createPineappleMcpServerFactory({
    resolveUser,
    createReads,
    createOperations,
    onAuthenticated,
    writesEnabled: () => enabled,
  });
  return {
    reads,
    operations,
    resolveUser,
    createReads,
    createOperations,
    onAuthenticated,
    factory,
  };
}

async function catalog(scopes: string[], enabled = true) {
  const deps = setup(enabled);
  const handler = createMcpHandler(deps.factory, { legacy: "reject", responseMode: "json" });
  const response = await handler.fetch(
    new Request("https://pineapple.txe.app/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-method": "tools/list",
        "mcp-protocol-version": "2026-07-28",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
            [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
            [CLIENT_CAPABILITIES_META_KEY]: {},
          },
        },
      }),
    }),
    { authInfo: { token: "test", clientId: "test", scopes, extra: { sub: "oauth-user" } } },
  );
  const json: unknown = await response.json();
  const body = json as { result?: { tools: { name: string }[] }; error?: unknown };
  expect(deps.operations.execute).not.toHaveBeenCalled();
  if (!scopes.includes("assets:read")) {
    // With no registered tools the SDK has no tools/list handler. The transport
    // separately rejects these credentials before reaching this factory.
    expect(body.error).toBeDefined();
    return [];
  }
  expect(body.result).toBeDefined();
  return body.result?.tools.map(({ name }) => name) ?? [];
}

const assetReads = ["list_assets", "get_asset"];
const maintenanceReads = ["get_due_maintenance", "get_asset_maintenance"];
const assetWrites = ["create_asset", "edit_asset"];
const maintenanceWrites = [
  "create_maintenance_task",
  "edit_maintenance_task",
  "reschedule_maintenance_task",
  "record_maintenance",
  "edit_maintenance_record",
];
const allScopes = ["assets:read", "maintenance:read", "assets:write", "maintenance:write"];

describe("Pineapple MCP composition", () => {
  it.each([
    [[], true, []],
    [["maintenance:read", "assets:write", "maintenance:write"], true, []],
    [["assets:read"], true, assetReads],
    [["assets:read", "maintenance:read"], true, [...assetReads, ...maintenanceReads]],
    [["assets:read", "assets:write"], true, [...assetReads, ...assetWrites]],
    [["assets:read", "maintenance:write"], true, [...assetReads, ...maintenanceWrites]],
    [allScopes, true, [...assetReads, ...maintenanceReads, ...assetWrites, ...maintenanceWrites]],
    [allScopes, false, [...assetReads, ...maintenanceReads]],
  ] as const)(
    "exposes exactly the granted catalog (%j; enabled %s)",
    async (scopes, enabled, expected) => {
      expect(await catalog([...scopes], enabled)).toEqual([...expected]);
    },
  );

  it("derives identity only from the verified subject and forwards the exact token grants", async () => {
    const deps = setup();
    await deps.factory({
      era: "modern",
      authInfo: {
        token: "not-forwarded",
        clientId: "test",
        scopes: ["assets:read"],
        extra: { sub: "oauth-user" },
      },
    });
    expect(deps.resolveUser).toHaveBeenCalledWith("oauth-user");
    expect(deps.createReads).toHaveBeenCalledWith(user);
    expect(deps.createOperations).toHaveBeenCalledWith(user);
    expect(deps.onAuthenticated).toHaveBeenCalledWith(user);
  });

  it("preserves an old asset-read grant without exposing new read or write tools", async () => {
    const { factory, operations } = setup();
    const handler = createMcpHandler(factory, { legacy: "reject", responseMode: "json" });
    const response = await handler.fetch(
      new Request("https://pineapple.txe.app/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "mcp-method": "tools/list",
          "mcp-protocol-version": "2026-07-28",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
      {
        authInfo: {
          token: "old-token",
          clientId: "test",
          scopes: ["assets:read"],
          extra: { sub: "oauth-user" },
        },
      },
    );
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      result: { tools: [{ name: "list_assets" }, { name: "get_asset" }] },
    });
    expect(JSON.stringify(body)).not.toContain("create_asset");
    expect(JSON.stringify(body)).not.toContain("get_due_maintenance");
    expect(operations.execute).not.toHaveBeenCalled();
  });

  it.each([undefined, null, false, true, "false", "TRUE", "1", "", " true "])(
    "fails closed for an invalid write setting %s",
    (value) => {
      expect(mcpWritesEnabled(value)).toBe(false);
    },
  );
  it("enables writes only for the explicit server setting", () => {
    expect(mcpWritesEnabled("true")).toBe(true);
  });
});
