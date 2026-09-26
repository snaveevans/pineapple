import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server";
import type { User } from "../../domain/identity/User.ts";
import type { AgentOperationExecutor } from "../../application/ports/AgentOperationExecutor.ts";
import { registerReadTools, type McpReadDependencies } from "./McpReadTools.ts";
import { registerWriteTools } from "./McpWriteTools.ts";

const SERVER_INFO = { name: "pineapple", version: "2.0.0" } as const;

export function mcpWritesEnabled(value: unknown): boolean {
  return value === "true";
}

export function createPineappleMcpServer(
  user: User,
  deps: {
    reads: McpReadDependencies;
    operations: AgentOperationExecutor;
    scopes: readonly string[];
    writesEnabled: () => boolean;
  },
): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerReadTools(server, user, deps.reads, deps.scopes);
  registerWriteTools(server, user, deps.operations, deps.scopes, deps.writesEnabled);
  return server;
}

export function createPineappleMcpServerFactory(deps: {
  resolveUser: (subject: unknown) => Promise<User>;
  createReads: (user: User) => McpReadDependencies;
  createOperations: (user: User) => AgentOperationExecutor;
  onAuthenticated: (user: User) => void;
  writesEnabled: () => boolean;
}): McpServerFactory {
  return async ({ authInfo }) => {
    const user = await deps.resolveUser(authInfo?.extra?.sub);
    deps.onAuthenticated(user);
    return createPineappleMcpServer(user, {
      reads: deps.createReads(user),
      operations: deps.createOperations(user),
      scopes: authInfo?.scopes ?? [],
      writesEnabled: deps.writesEnabled,
    });
  };
}
