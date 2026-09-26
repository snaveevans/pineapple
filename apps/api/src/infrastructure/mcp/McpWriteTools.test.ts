import { describe, expect, it, vi } from "vitest";
import {
  createMcpHandler,
  McpServer,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { AssetId, Email, UserId, ValidationError, ok, err } from "@snaveevans/pineapple-shared";
import type {
  AgentOperationExecutor,
  AgentMutationReceipt,
} from "../../application/ports/AgentOperationExecutor.ts";
import { User } from "../../domain/identity/User.ts";
import { registerWriteTools } from "./McpWriteTools.ts";

const user = User.reconstitute({
  id: UserId.generate(),
  email: Email.from("mcp@example.com"),
  name: "Operator",
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});
const assetId = AssetId.generate();
const operationId = crypto.randomUUID();
const receipt: AgentMutationReceipt = {
  operationId,
  replayed: false,
  entityType: "asset",
  entityId: assetId,
  assetId,
  appliedRevision: 0,
};
const allScopes = ["assets:read", "maintenance:read", "assets:write", "maintenance:write"];

function setup(scopes = allScopes, enabled = true) {
  const execute = vi.fn<AgentOperationExecutor["execute"]>().mockResolvedValue(ok(receipt));
  let writesEnabled = enabled;
  const server = new McpServer({ name: "pineapple", version: "2" });
  registerWriteTools(server, user, { execute }, scopes, () => writesEnabled);
  const handler = createMcpHandler(() => server, { legacy: "reject", responseMode: "json" });
  async function request(method: string, params: Record<string, unknown> = {}) {
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
    return body as {
      result?: {
        tools?: Array<{ name: string; annotations: Record<string, boolean> }>;
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
        content?: Array<{ text: string }>;
      };
      error?: unknown;
    };
  }
  return {
    execute,
    request,
    disable: () => {
      writesEnabled = false;
    },
  };
}

describe("MCP bounded write adapter", () => {
  it("advertises only the seven recoverable writes with truthful overwrite annotations", async () => {
    const { request } = setup();
    const result = await request("tools/list");
    expect(result.result?.tools?.map((tool) => tool.name)).toEqual([
      "create_asset",
      "edit_asset",
      "create_maintenance_task",
      "edit_maintenance_task",
      "reschedule_maintenance_task",
      "record_maintenance",
      "edit_maintenance_record",
    ]);
    for (const tool of result.result?.tools ?? []) {
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: !["create_asset", "create_maintenance_task"].includes(tool.name),
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it.each([
    ["read-only", ["assets:read"]],
    ["disabled", allScopes],
  ])("hides and blocks writes for %s connections", async (label, scopes) => {
    const { request, execute } = setup(scopes, label !== "disabled");
    expect((await request("tools/list")).result?.tools ?? []).toEqual([]);
    const result = await request("tools/call", {
      name: "create_asset",
      arguments: { operationId, name: "Mower", metadata: { kind: "equipment" } },
    });
    expect(result.error ?? result.result?.isError).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
  });

  it("separates asset and maintenance write grants", async () => {
    const { request } = setup(["assets:read", "assets:write"]);
    expect((await request("tools/list")).result?.tools?.map((tool) => tool.name)).toEqual([
      "create_asset",
      "edit_asset",
    ]);
  });

  it("checks the write switch again when executing a cached declaration", async () => {
    const { request, execute, disable } = setup();
    disable();
    const result = await request("tools/call", {
      name: "create_asset",
      arguments: { operationId, name: "Mower", metadata: { kind: "equipment" } },
    });
    expect(result.result?.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes authenticated identity and user-supplied property street only to the executor", async () => {
    const { request, execute } = setup();
    const args = {
      operationId,
      name: "867 Secret Lane",
      metadata: {
        kind: "property",
        address: {
          street: "867 Secret Lane",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          country: "US",
        },
      },
    };
    const result = await request("tools/call", { name: "create_asset", arguments: args });
    expect(execute).toHaveBeenCalledWith(user.id, { ...args, kind: "create_asset" });
    expect(result.result?.structuredContent).toEqual({ receipt });
    expect(JSON.stringify(result)).not.toContain("867 Secret Lane");
    expect(JSON.parse(result.result?.content?.[0]?.text ?? "null")).toEqual(
      result.result?.structuredContent,
    );
  });

  it("preserves omission and explicit null in partial property edits", async () => {
    const { request, execute } = setup();
    const args = {
      operationId,
      assetId,
      expectedRevision: 4,
      metadata: { kind: "property", nickname: null, address: { city: "Boulder" } },
    };
    await request("tools/call", { name: "edit_asset", arguments: args });
    expect(execute).toHaveBeenCalledWith(user.id, { ...args, kind: "edit_asset" });
    const command = execute.mock.calls[0]?.[1];
    expect(command).not.toHaveProperty("name");
    expect(command).not.toHaveProperty("metadata.address.street");
  });

  it.each([
    [
      "create_asset",
      { operationId, name: "Mower", ownerId: UserId.generate(), metadata: { kind: "equipment" } },
    ],
    [
      "create_asset",
      { operationId, name: "Mower", metadata: { kind: "equipment", sharing: true } },
    ],
    ["edit_asset", { operationId, assetId, expectedRevision: 0 }],
    ["edit_asset", { operationId, assetId, expectedRevision: -1, name: "Mower" }],
    [
      "edit_asset",
      { operationId, assetId, expectedRevision: 0, metadata: { kind: "property", address: {} } },
    ],
    [
      "edit_maintenance_task",
      { operationId, assetId, taskId: crypto.randomUUID(), expectedRevision: 1 },
    ],
    [
      "record_maintenance",
      {
        operationId,
        assetId,
        title: "Done",
        performedAt: "2026-02-30",
        taskId: crypto.randomUUID(),
        expectedTaskRevision: 1,
      },
    ],
    [
      "record_maintenance",
      {
        operationId,
        assetId,
        title: "Done",
        performedAt: "2026-01-01",
        taskId: crypto.randomUUID(),
      },
    ],
    [
      "record_maintenance",
      { operationId, assetId, title: "Done", performedAt: "2026-01-01", expectedTaskRevision: 1 },
    ],
    [
      "edit_maintenance_record",
      { operationId, assetId, recordId: crypto.randomUUID(), expectedRevision: 0 },
    ],
  ])("rejects invalid or unauthorized input for %s before execution", async (name, args) => {
    const { request, execute } = setup();
    const result = await request("tools/call", { name, arguments: args });
    expect(result.result?.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("never renders raw error text, even when a domain validation error contains street input", async () => {
    const { request, execute } = setup();
    execute.mockResolvedValue(
      err(new ValidationError("867 Secret Lane is invalid", "metadata.address.street")),
    );
    const result = await request("tools/call", {
      name: "create_asset",
      arguments: { operationId, name: "Mower", metadata: { kind: "equipment" } },
    });
    expect(result.result?.isError).toBe(true);
    expect(result.result?.structuredContent).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "The change is invalid. Check the supplied fields.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("867 Secret Lane");
  });

  it("returns a safe retry message after an unexpected failure", async () => {
    const { request, execute } = setup();
    execute.mockRejectedValue(new Error("private snapshot and street"));
    const result = await request("tools/call", {
      name: "create_asset",
      arguments: { operationId, name: "Mower", metadata: { kind: "equipment" } },
    });
    expect(result.result?.structuredContent).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Pineapple could not complete the request. Retry with the same operation ID.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private snapshot");
  });
});
