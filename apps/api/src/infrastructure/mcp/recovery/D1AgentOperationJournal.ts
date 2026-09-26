import { ConflictError, InvariantError } from "@snaveevans/pineapple-shared";
import type { AgentMutationReceipt } from "../../../application/ports/AgentOperationExecutor.ts";
import type {
  AgentJournalCommit,
  AgentRowChange,
  AgentRowSnapshot,
  AgentRowTable,
  StoredAgentOperation,
} from "./AgentJournalTypes.ts";

const SNAPSHOT_VERSION = 1;
const OPERATION_TOOLS = new Set([
  "create_asset",
  "edit_asset",
  "create_maintenance_task",
  "edit_maintenance_task",
  "reschedule_maintenance_task",
  "record_maintenance",
  "edit_maintenance_record",
]);

const TABLE_COLUMNS: Record<AgentRowTable, ReadonlySet<string>> = {
  assets: new Set([
    "id",
    "owner_id",
    "name",
    "type",
    "metadata",
    "archived_at",
    "created_at",
    "updated_at",
    "shared_team_id",
    "revision",
  ]),
  maintenance_tasks: new Set([
    "id",
    "asset_id",
    "owner_id",
    "title",
    "interval_value",
    "interval_unit",
    "last_completed_date",
    "next_due",
    "created_at",
    "schedule_seed_date",
    "initial_last_completed_date",
    "revision",
    "next_due_override",
  ]),
  maintenance_records: new Set([
    "id",
    "asset_id",
    "owner_id",
    "title",
    "performed_at",
    "notes",
    "created_at",
    "task_id",
    "revision",
  ]),
};

type CanonicalJson =
  null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

type JournalRow = {
  actor_id: unknown;
  operation_id: unknown;
  tool: unknown;
  input_hash: unknown;
  receipt_json: unknown;
  snapshot_version: unknown;
  snapshots_json: unknown;
  created_at: unknown;
  restored_at: unknown;
};

/** Hashes the complete tool and validated input without depending on object key order. */
export async function hashAgentInput(tool: string, input: unknown): Promise<string> {
  const canonical = canonicalJson({ tool, input });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class D1AgentOperationJournal {
  constructor(private readonly db: D1Database) {}

  async find(actorId: string, operationId: string): Promise<StoredAgentOperation | null> {
    let row: unknown;
    try {
      row = await this.db
        .prepare(
          `SELECT actor_id, operation_id, tool, input_hash, receipt_json,
                snapshot_version, snapshots_json, created_at, restored_at
         FROM agent_operation_journal
         WHERE actor_id = ? AND operation_id = ?`,
        )
        .bind(actorId, operationId)
        .first<unknown>();
    } catch {
      throw new InvariantError("Agent operation evidence could not be read.");
    }
    if (row === null) return null;
    return parseStoredOperation(row);
  }

  async commit(request: AgentJournalCommit): Promise<AgentMutationReceipt> {
    const inputHash = await hashAgentInput(request.tool, request.input);
    const receipt = copySafeReceipt(request.receipt);
    if (receipt.operationId !== request.operationId) {
      throw new InvariantError("Agent mutation receipt operation ID does not match.");
    }
    const changes = copyChanges(request.changes);

    const existing = await this.find(request.actorId, request.operationId);
    if (existing !== null) return this.#replayOrConflict(existing, request.tool, inputHash);

    const snapshots = JSON.stringify({ version: SNAPSHOT_VERSION, changes });
    const journalStatement = this.db
      .prepare(
        `INSERT INTO agent_operation_journal
           (actor_id, operation_id, tool, input_hash, receipt_json,
            snapshot_version, snapshots_json, created_at, restored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        request.actorId,
        request.operationId,
        request.tool,
        inputHash,
        JSON.stringify(receipt),
        SNAPSHOT_VERSION,
        snapshots,
        new Date().toISOString(),
      );

    try {
      await this.db.batch([journalStatement, ...request.statements]);
      return { ...receipt, replayed: false };
    } catch (error) {
      // A concurrent request may have committed while this batch was running.
      // Resolve only a matching durable entry. Provider messages may contain private input.
      const committed = await this.find(request.actorId, request.operationId);
      if (committed !== null) return this.#replayOrConflict(committed, request.tool, inputHash);
      if (
        error instanceof Error &&
        error.message.includes("CHECK constraint failed: assertion = 1")
      ) {
        throw new ConflictError("The source changed while this operation was being saved.");
      }
      throw new InvariantError("Agent operation could not be saved.");
    }
  }

  #replayOrConflict(
    existing: StoredAgentOperation,
    tool: AgentJournalCommit["tool"],
    inputHash: string,
  ): AgentMutationReceipt {
    if (existing.tool !== tool || existing.inputHash !== inputHash) {
      throw new ConflictError("This operation ID was already used with different input.");
    }
    return { ...existing.receipt, replayed: true };
  }
}

function canonicalJson(value: unknown): string {
  try {
    const normalized = normalizeJson(value, new WeakSet<object>());
    const serialized = JSON.stringify(normalized);
    if (serialized === undefined) throw new Error("unserializable");
    return serialized;
  } catch {
    throw new InvariantError("Agent operation input must be JSON-compatible.");
  }
}

function normalizeJson(value: unknown, ancestors: WeakSet<object>): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return value;
  }
  if (typeof value !== "object") throw new Error("non-JSON value");
  if (ancestors.has(value)) throw new Error("cyclic value");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: CanonicalJson[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error("sparse array");
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) throw new Error("array accessor");
        result.push(normalizeJson(descriptor.value, ancestors));
      }
      const extraKeys = Reflect.ownKeys(value).filter(
        (key) => key !== "length" && !isArrayIndex(key, value.length),
      );
      if (extraKeys.length > 0) throw new Error("array properties");
      return result;
    }

    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("non-plain object");
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("symbol key");

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    const result: { [key: string]: CanonicalJson } = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("non-JSON property");
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: normalizeJson(descriptor.value, ancestors),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function isArrayIndex(key: PropertyKey, length: number): boolean {
  if (typeof key !== "string" || key.length === 0) return false;
  const parsed = Number(key);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < length && String(parsed) === key;
}

function copySafeReceipt(value: unknown): Omit<AgentMutationReceipt, "replayed"> {
  if (!isRecord(value))
    throw new InvariantError("Agent mutation receipt has an unsupported shape.");
  const allowed = new Set([
    "operationId",
    "entityType",
    "entityId",
    "assetId",
    "appliedRevision",
    "linkedTask",
  ]);
  if (!hasOnlyKeys(value, allowed)) {
    throw new InvariantError("Agent mutation receipt has an unsupported shape.");
  }
  if (
    !isString(value.operationId) ||
    !isString(value.entityId) ||
    !isString(value.assetId) ||
    !isNonNegativeInteger(value.appliedRevision) ||
    (value.entityType !== "asset" && value.entityType !== "task" && value.entityType !== "record")
  ) {
    throw new InvariantError("Agent mutation receipt has an unsupported shape.");
  }

  const result: Omit<AgentMutationReceipt, "replayed"> = {
    operationId: value.operationId,
    entityType: value.entityType,
    entityId: value.entityId,
    assetId: value.assetId,
    appliedRevision: value.appliedRevision,
  };
  if (Object.hasOwn(value, "linkedTask")) {
    if (
      !isRecord(value.linkedTask) ||
      !hasOnlyKeys(value.linkedTask, new Set(["taskId", "appliedRevision", "nextDue"]))
    ) {
      throw new InvariantError("Agent mutation receipt has an unsupported shape.");
    }
    if (
      !isString(value.linkedTask.taskId) ||
      !isNonNegativeInteger(value.linkedTask.appliedRevision) ||
      !isString(value.linkedTask.nextDue)
    ) {
      throw new InvariantError("Agent mutation receipt has an unsupported shape.");
    }
    result.linkedTask = {
      taskId: value.linkedTask.taskId,
      appliedRevision: value.linkedTask.appliedRevision,
      nextDue: value.linkedTask.nextDue,
    };
  }
  return result;
}

function copyChanges(value: unknown): AgentRowChange[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new InvariantError("Agent operation snapshots have an unsupported shape.");
  const seen = new Set<string>();
  return value.map((change) => {
    if (!isRecord(change) || !hasOnlyKeys(change, new Set(["table", "id", "before", "after"]))) {
      throw new InvariantError("Agent operation snapshots have an unsupported shape.");
    }
    if (!isAgentRowTable(change.table) || !isString(change.id)) {
      throw new InvariantError("Agent operation snapshots have an unsupported shape.");
    }
    const identity = `${change.table}:${change.id}`;
    if (seen.has(identity))
      throw new InvariantError("Agent operation snapshots contain a duplicate row.");
    seen.add(identity);
    const before = copySnapshot(change.table, change.id, change.before);
    const after = copySnapshot(change.table, change.id, change.after);
    // Agent operations never delete. Even a no-op retains identical full
    // snapshots so omitted recovery evidence cannot masquerade as a no-op.
    if (after === null) {
      throw new InvariantError("Agent operation snapshots are incomplete.");
    }
    return { table: change.table, id: change.id, before, after };
  });
}

function copySnapshot(table: AgentRowTable, id: string, value: unknown): AgentRowSnapshot | null {
  if (value === null) return null;
  if (!isRecord(value))
    throw new InvariantError("Agent operation snapshots have an unsupported shape.");
  if (
    Object.keys(value).length !== TABLE_COLUMNS[table].size ||
    [...TABLE_COLUMNS[table]].some((column) => !Object.hasOwn(value, column))
  ) {
    throw new InvariantError("Agent operation snapshots are incomplete.");
  }
  const snapshot: AgentRowSnapshot = {};
  for (const [column, columnValue] of Object.entries(value)) {
    if (!TABLE_COLUMNS[table].has(column)) {
      throw new InvariantError("Agent operation snapshots contain an unsupported column.");
    }
    if (
      columnValue !== null &&
      typeof columnValue !== "string" &&
      (typeof columnValue !== "number" || !Number.isFinite(columnValue))
    ) {
      throw new InvariantError("Agent operation snapshots contain an unsupported value.");
    }
    snapshot[column] = columnValue;
  }
  if (snapshot.id !== id)
    throw new InvariantError("Agent operation snapshot identity does not match.");
  return snapshot;
}

function parseStoredOperation(value: unknown): StoredAgentOperation {
  if (!isRecord(value)) throw new InvariantError("Stored agent operation is malformed.");
  const row: JournalRow = {
    actor_id: value.actor_id,
    operation_id: value.operation_id,
    tool: value.tool,
    input_hash: value.input_hash,
    receipt_json: value.receipt_json,
    snapshot_version: value.snapshot_version,
    snapshots_json: value.snapshots_json,
    created_at: value.created_at,
    restored_at: value.restored_at,
  };
  if (
    !isString(row.actor_id) ||
    !isString(row.operation_id) ||
    !isOperationTool(row.tool) ||
    !isString(row.input_hash) ||
    !/^[0-9a-f]{64}$/.test(row.input_hash) ||
    row.snapshot_version !== SNAPSHOT_VERSION ||
    !isString(row.receipt_json) ||
    !isString(row.snapshots_json) ||
    !isString(row.created_at) ||
    (row.restored_at !== null && !isString(row.restored_at))
  ) {
    throw new InvariantError("Stored agent operation is malformed.");
  }

  const receipt = copySafeReceipt(
    parseJson(row.receipt_json, "Stored agent operation receipt is malformed."),
  );
  if (receipt.operationId !== row.operation_id) {
    throw new InvariantError("Stored agent operation receipt is malformed.");
  }
  const snapshots = parseJson(
    row.snapshots_json,
    "Stored agent operation snapshots are malformed.",
  );
  if (
    !isRecord(snapshots) ||
    !hasOnlyKeys(snapshots, new Set(["version", "changes"])) ||
    snapshots.version !== SNAPSHOT_VERSION
  ) {
    throw new InvariantError("Stored agent operation snapshots are malformed.");
  }
  return {
    actorId: row.actor_id,
    operationId: row.operation_id,
    tool: row.tool,
    inputHash: row.input_hash,
    receipt,
    changes: copyChanges(snapshots.changes),
    createdAt: row.created_at,
    restoredAt: row.restored_at,
  };
}

function parseJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new InvariantError(message);
  }
}

function isOperationTool(value: unknown): value is AgentJournalCommit["tool"] {
  return typeof value === "string" && OPERATION_TOOLS.has(value);
}

function isAgentRowTable(value: unknown): value is AgentRowTable {
  return value === "assets" || value === "maintenance_tasks" || value === "maintenance_records";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
