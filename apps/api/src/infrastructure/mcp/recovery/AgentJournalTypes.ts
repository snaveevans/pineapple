import type { UserId } from "@snaveevans/pineapple-shared";
import type {
  AgentMutationCommand,
  AgentMutationReceipt,
} from "../../../application/ports/AgentOperationExecutor.ts";

export type AgentRowTable = "assets" | "maintenance_tasks" | "maintenance_records";
export type AgentRowSnapshot = Record<string, string | number | null>;
export type AgentRowChange = {
  table: AgentRowTable;
  id: string;
  before: AgentRowSnapshot | null;
  after: AgentRowSnapshot | null;
};
export type StoredAgentOperation = {
  actorId: string;
  operationId: string;
  tool: AgentMutationCommand["kind"];
  inputHash: string;
  receipt: Omit<AgentMutationReceipt, "replayed">;
  changes: AgentRowChange[];
  createdAt: string;
  restoredAt: string | null;
};
export type AgentJournalCommit = {
  actorId: UserId;
  operationId: string;
  tool: AgentMutationCommand["kind"];
  input: unknown;
  receipt: Omit<AgentMutationReceipt, "replayed">;
  changes: AgentRowChange[];
  /** Includes access/source guards, domain writes, and activity/notification outboxes. */
  statements: D1PreparedStatement[];
};
