import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  createMcpHandler,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { AssetId, Email, UserId, ok } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentMutationReceipt,
  AgentOperationExecutor,
} from "../../application/ports/AgentOperationExecutor.ts";
import { User } from "../../domain/identity/User.ts";
import { registerWriteTools } from "./McpWriteTools.ts";

const USER = User.reconstitute({
  id: UserId.generate(),
  email: Email.from("mcp-adversarial@example.com"),
  name: "Operator",
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});
const ASSET_ID = AssetId.generate();
const OPERATION_ID = crypto.randomUUID();
const RECEIPT: AgentMutationReceipt = {
  operationId: OPERATION_ID,
  replayed: false,
  entityType: "asset",
  entityId: ASSET_ID,
  assetId: ASSET_ID,
  appliedRevision: 1,
};
const SCOPES = ["assets:read", "maintenance:read", "assets:write", "maintenance:write"];

type ToolReply = {
  result?: {
    isError?: boolean;
    tools?: Array<{ name: string }>;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ text: string }>;
  };
  error?: unknown;
};

function setup(scopes: readonly string[] = SCOPES) {
  const execute = vi.fn<AgentOperationExecutor["execute"]>().mockResolvedValue(ok(RECEIPT));
  const server = new McpServer({ name: "pineapple", version: "2" });
  registerWriteTools(server, USER, { execute }, scopes, () => true);
  const handler = createMcpHandler(() => server, { legacy: "reject", responseMode: "json" });

  async function request(method: string, params: Record<string, unknown> = {}): Promise<ToolReply> {
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
          params: {
            ...params,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
    );
    const body: unknown = await response.json();
    return body as ToolReply;
  }

  return { execute, request };
}

describe("MCP write adapter adversarial contract", () => {
  it.each([
    [
      "create_asset",
      {
        operationId: OPERATION_ID,
        name: "Home",
        metadata: {
          kind: "property",
          nickname: "Safe label",
          address: {
            street: "123 Main Street",
            city: "Denver",
            state: "CO",
            postalCode: "80202",
            country: "US",
            ownerId: "attacker-controlled-owner",
          },
        },
      },
    ],
    [
      "create_asset",
      {
        operationId: OPERATION_ID,
        name: "Generator",
        metadata: { kind: "equipment", manufacturer: "Honda", revision: 88 },
      },
    ],
    [
      "edit_asset",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        expectedRevision: 1,
        metadata: {
          kind: "property",
          address: { city: "Boulder", street: "Must be rejected", id: "attacker" },
        },
      },
    ],
    [
      "create_maintenance_task",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        title: "Oil change",
        intervalValue: 3,
        intervalUnit: "month",
        scheduleSeedDate: "2026-01-01",
        revision: 9,
      },
    ],
    [
      "edit_maintenance_task",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        taskId: crypto.randomUUID(),
        expectedRevision: 4,
        title: "Updated",
        initialLastCompletedDate: "2026-01-01",
      },
    ],
    [
      "reschedule_maintenance_task",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        taskId: crypto.randomUUID(),
        expectedRevision: 4,
        nextDue: "2027-01-01",
        nextDueOverride: "2027-01-01",
      },
    ],
    [
      "record_maintenance",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        title: "Done",
        performedAt: "2026-09-01",
        ownerId: "attacker-controlled-owner",
      },
    ],
    [
      "edit_maintenance_record",
      {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        recordId: crypto.randomUUID(),
        expectedRevision: 3,
        notes: null,
        taskId: crypto.randomUUID(),
      },
    ],
  ])("rejects nested or server-owned fields for %s before execution", async (name, args) => {
    const { execute, request } = setup();

    const reply = await request("tools/call", { name, arguments: args });

    expect(reply.result?.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(reply)).not.toContain("attacker-controlled-owner");
    expect(JSON.stringify(reply)).not.toContain("Must be rejected");
  });

  it("rechecks the current scope set when a previously discovered callback is invoked", async () => {
    const scopes = [...SCOPES];
    const { execute, request } = setup(scopes);
    expect((await request("tools/list")).result?.tools?.map((tool) => tool.name)).toContain(
      "edit_maintenance_task",
    );
    scopes.splice(scopes.indexOf("maintenance:write"), 1);

    const reply = await request("tools/call", {
      name: "edit_maintenance_task",
      arguments: {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        taskId: crypto.randomUUID(),
        expectedRevision: 2,
        title: "must not execute",
      },
    });

    expect(reply.result?.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a receipt with unexpected private fields before either representation is returned", async () => {
    const { execute, request } = setup();
    const privateCanary = "91 Private Property Road";
    execute.mockResolvedValue(ok({ ...RECEIPT, privateCanary }));

    const reply = await request("tools/call", {
      name: "create_asset",
      arguments: {
        operationId: OPERATION_ID,
        name: "House",
        metadata: {
          kind: "property",
          address: {
            street: privateCanary,
            city: "Denver",
            state: "CO",
            postalCode: "80202",
            country: "US",
          },
        },
      },
    });

    expect(reply.result?.isError).toBe(true);
    expect(reply.result?.structuredContent).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(reply)).not.toContain(privateCanary);
  });

  it("keeps a cached callback inert after its matching scope is removed", async () => {
    const scopes = [...SCOPES];
    const { execute, request } = setup(scopes);
    expect((await request("tools/list")).result?.tools?.map((tool) => tool.name)).toContain(
      "edit_asset",
    );
    scopes.splice(scopes.indexOf("assets:write"), 1);

    const reply = await request("tools/call", {
      name: "edit_asset",
      arguments: {
        operationId: OPERATION_ID,
        assetId: ASSET_ID,
        expectedRevision: 2,
        name: "must not execute",
      },
    });

    expect(reply.result?.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
