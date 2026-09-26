import { AssetId, InvariantError, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../../domain/asset/AssetType.ts";
import type { DomainEvent } from "../../../domain/events/DomainEvent.ts";
import { MaintenanceTaskDeleted } from "../../../domain/maintenance/events/MaintenanceTaskDeleted.ts";
import { MaintenanceTaskUpdated } from "../../../domain/maintenance/events/MaintenanceTaskUpdated.ts";
import type { IntervalUnit } from "../../../domain/maintenance/IntervalUnit.ts";
import { prepareNotificationOutboxInsert } from "../../notifications/D1NotificationOutboxRepository.ts";
import { NOTIFICATION_EVENTS_CONSUMER } from "../../notifications/NotificationEventMessage.ts";
import type {
  AgentRowChange,
  AgentRowSnapshot,
  AgentRowTable,
  StoredAgentOperation,
} from "./AgentJournalTypes.ts";
import { D1AgentOperationJournal } from "./D1AgentOperationJournal.ts";

type RecoveryStatus =
  "not_found" | "found" | "dry_run_ready" | "blocked" | "already_restored" | "restored";
type RecoveryReason =
  | "incomplete_snapshot"
  | "unsupported_snapshot"
  | "current_state_changed"
  | "dependent_data_exists"
  | "transaction_guard_failed";

export type AgentOperationRecoveryReport = {
  operationId: string;
  status: RecoveryStatus;
  tool: StoredAgentOperation["tool"] | null;
  createdAt: string | null;
  restoredAt: string | null;
  affectedRows: number;
  changedRows: number;
  reasonCodes: RecoveryReason[];
};

type CurrentAssetIdentity = {
  id: string;
  owner_id: string;
  name: string;
  type: AssetType;
};

type RecoveryPlan = {
  operation: StoredAgentOperation;
  changes: AgentRowChange[];
  assets: Map<string, CurrentAssetIdentity>;
  currentRows: Map<string, AgentRowSnapshot>;
  journalEntryCounts: Map<string, number>;
  latestCausalAt: number;
  reasons: Set<RecoveryReason>;
  changedRows: number;
};

type LaterOperationChange = {
  operation: StoredAgentOperation;
  change: AgentRowChange;
};

type LaterChangeSet = {
  later: LaterOperationChange[];
  all: LaterOperationChange[];
  journalEntryCount: number;
};

const SNAPSHOT_COLUMNS: Record<AgentRowTable, readonly string[]> = {
  assets: [
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
  ],
  maintenance_tasks: [
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
  ],
  maintenance_records: [
    "id",
    "asset_id",
    "owner_id",
    "title",
    "performed_at",
    "notes",
    "created_at",
    "task_id",
    "revision",
  ],
};

/** Internal operator planner. Reports contain no journal snapshots or raw input. */
export class D1AgentOperationRecovery {
  readonly #journal: D1AgentOperationJournal;

  constructor(private readonly db: D1Database) {
    this.#journal = new D1AgentOperationJournal(db);
  }

  async inspect(actorId: string, operationId: string): Promise<AgentOperationRecoveryReport> {
    const operation = await this.#journal.find(actorId, operationId);
    if (operation === null) return emptyReport(operationId, "not_found");
    const changedRows = operation.changes.filter(
      (change) => !snapshotsEqual(change.before, change.after),
    ).length;
    return {
      operationId,
      status: "found",
      tool: operation.tool,
      createdAt: operation.createdAt,
      restoredAt: operation.restoredAt,
      affectedRows: operation.changes.length,
      changedRows,
      reasonCodes: [],
    };
  }

  /** Defaults to dry-run. Set apply only after reviewing the dry-run report. */
  async recover(
    actorId: string,
    operationId: string,
    options: { apply?: boolean } = {},
  ): Promise<AgentOperationRecoveryReport> {
    const operation = await this.#journal.find(actorId, operationId);
    if (operation === null) return emptyReport(operationId, "not_found");
    const baseReport = reportFor(operation);
    if (operation.restoredAt !== null) return { ...baseReport, status: "already_restored" };

    const plan = await this.#plan(operation);
    if (plan.reasons.size > 0) {
      return { ...baseReport, status: "blocked", reasonCodes: [...plan.reasons] };
    }
    if (options.apply !== true) return { ...baseReport, status: "dry_run_ready" };

    const nextRestoredAt = Math.max(Date.now(), plan.latestCausalAt + 1);
    if (!Number.isFinite(nextRestoredAt) || nextRestoredAt > 8_640_000_000_000_000) {
      return { ...baseReport, status: "blocked", reasonCodes: ["unsupported_snapshot"] };
    }
    const restoredAt = new Date(nextRestoredAt).toISOString();
    const statements = this.#buildTransaction(plan, restoredAt);
    try {
      const results = await this.db.batch(statements);
      if (results.length !== statements.length || results.some((result) => !result.success)) {
        return {
          ...baseReport,
          status: "blocked",
          reasonCodes: ["transaction_guard_failed"],
        };
      }
      return { ...baseReport, status: "restored", restoredAt };
    } catch {
      // D1 batches roll back on any failed statement. Keep storage details and
      // snapshot values out of the operator report and all logs.
      return {
        ...baseReport,
        status: "blocked",
        reasonCodes: ["transaction_guard_failed"],
      };
    }
  }

  async #plan(operation: StoredAgentOperation): Promise<RecoveryPlan> {
    const reasons = new Set<RecoveryReason>();
    const assets = new Map<string, CurrentAssetIdentity>();
    const currentRows = new Map<string, AgentRowSnapshot>();
    const journalEntryCounts = new Map<string, number>();
    const operationCreatedAt = timestampMilliseconds(operation.createdAt);
    let latestCausalAt = operationCreatedAt ?? 0;
    const changes = operation.changes;
    if (operationCreatedAt === null) reasons.add("unsupported_snapshot");
    if (changes.length === 0 || changes.some((change) => !isCompleteChange(change))) {
      reasons.add("incomplete_snapshot");
    }
    if (!isSemanticallyRestorable(operation)) reasons.add("unsupported_snapshot");

    let changedRows = 0;
    for (const change of changes) {
      if (change.before === null || !snapshotsEqual(change.before, change.after)) changedRows += 1;
      if (change.after === null || !isCompleteSnapshot(change.table, change.after)) continue;

      const current = await this.#readCurrentRow(change.table, change.id);
      const laterChangeSet =
        current === null ? null : await this.#readLaterChanges(operation, change);
      if (current !== null) currentRows.set(rowKey(change.table, change.id), current);
      if (laterChangeSet !== null) {
        journalEntryCounts.set(rowKey(change.table, change.id), laterChangeSet.journalEntryCount);
        for (const entry of laterChangeSet.all) {
          const createdAt = timestampMilliseconds(entry.operation.createdAt);
          const restoredAt =
            entry.operation.restoredAt === null
              ? null
              : timestampMilliseconds(entry.operation.restoredAt);
          if (createdAt === null || (entry.operation.restoredAt !== null && restoredAt === null)) {
            reasons.add("unsupported_snapshot");
          } else {
            latestCausalAt = Math.max(latestCausalAt, createdAt, restoredAt ?? createdAt);
          }
        }
      }
      if (
        current === null ||
        laterChangeSet === null ||
        !this.#matchesAfterState(change, current, laterChangeSet.later)
      ) {
        reasons.add("current_state_changed");
      }

      if (change.before === null) {
        const hasDependents = await this.#hasCreationDependents(change);
        if (hasDependents) reasons.add("dependent_data_exists");
      }

      if (change.table === "maintenance_tasks" && change.before !== null) {
        const changedRecordIds = changes
          .filter((candidate) => candidate.table === "maintenance_records")
          .map((candidate) => candidate.id);
        if (await this.#hasLaterTaskRecords(change.id, operation.createdAt, changedRecordIds)) {
          reasons.add("dependent_data_exists");
        }
      }

      if (change.table === "maintenance_tasks") {
        const task = change.after;
        const asset = await this.#readAssetIdentity(stringValue(task.asset_id));
        if (asset === null) {
          reasons.add("current_state_changed");
        } else {
          assets.set(asset.id, asset);
        }
        try {
          const latestNotificationAt = await this.#latestNotificationEventAt(change.id);
          if (latestNotificationAt !== null)
            latestCausalAt = Math.max(latestCausalAt, latestNotificationAt);
        } catch {
          reasons.add("unsupported_snapshot");
        }
      }
    }
    return {
      operation,
      changes,
      assets,
      currentRows,
      journalEntryCounts,
      latestCausalAt,
      reasons,
      changedRows,
    };
  }

  async #readCurrentRow(table: AgentRowTable, id: string): Promise<AgentRowSnapshot | null> {
    const row = await this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<unknown>();
    if (!isRecord(row)) return null;
    return isSnapshot(row) ? row : null;
  }

  #matchesAfterState(
    change: AgentRowChange,
    current: AgentRowSnapshot,
    laterChanges: LaterOperationChange[],
  ): boolean {
    if (change.after === null) return false;
    if (laterChanges.length === 0) return rowMatchesSnapshot(current, change.after);
    if (laterChanges.some((entry) => entry.operation.restoredAt === null)) return false;
    const orderedChanges = orderLaterChanges(change.after, laterChanges);
    if (orderedChanges === null) return false;

    let expected = change.after;
    for (const entry of orderedChanges) {
      if (entry.change.before === null || !snapshotsEqual(entry.change.before, expected))
        return false;
      if (entry.change.after === null) return false;
      expected = entry.change.after;
    }
    return compensatedStateMatches(change.table, change.after, current, orderedChanges);
  }

  async #readLaterChanges(
    operation: StoredAgentOperation,
    change: AgentRowChange,
  ): Promise<LaterChangeSet | null> {
    try {
      const result = await this.db
        .prepare(
          `SELECT actor_id, operation_id
           FROM agent_operation_journal AS entry
           WHERE created_at >= ?
             AND NOT (actor_id = ? AND operation_id = ?)
             AND EXISTS (
               SELECT 1 FROM json_each(entry.snapshots_json, '$.changes') AS candidate
               WHERE json_extract(candidate.value, '$.table') = ?
                 AND json_extract(candidate.value, '$.id') = ?
             )
           ORDER BY created_at ASC, actor_id ASC, operation_id ASC`,
        )
        .bind(
          operation.createdAt,
          operation.actorId,
          operation.operationId,
          change.table,
          change.id,
        )
        .all<unknown>();
      const entries: LaterOperationChange[] = [];
      for (const row of result.results) {
        if (!isRecord(row) || !isString(row.actor_id) || !isString(row.operation_id)) return null;
        const later = await this.#journal.find(row.actor_id, row.operation_id);
        if (later === null || !isSemanticallyRestorable(later)) return null;
        const matching = later.changes.filter(
          (candidate) => candidate.table === change.table && candidate.id === change.id,
        );
        const laterChange = matching[0];
        if (matching.length !== 1 || laterChange === undefined || !isCompleteChange(laterChange)) {
          return null;
        }
        entries.push({ operation: later, change: laterChange });
      }
      const sameTimestamp: LaterOperationChange[] = [];
      const laterTimestamp: LaterOperationChange[] = [];
      for (const entry of entries) {
        if (entry.operation.createdAt === operation.createdAt) {
          sameTimestamp.push(entry);
        } else if (entry.operation.createdAt > operation.createdAt) {
          laterTimestamp.push(entry);
        } else {
          return null;
        }
      }
      const sameTimestampLater = classifySameTimestampChanges(change, sameTimestamp);
      if (sameTimestampLater === null) return null;
      return {
        later: [...sameTimestampLater, ...laterTimestamp],
        all: entries,
        journalEntryCount: entries.length,
      };
    } catch {
      // A malformed or unsupported later journal row invalidates the chain proof.
      return null;
    }
  }

  async #readAssetIdentity(id: string): Promise<CurrentAssetIdentity | null> {
    const row = await this.db
      .prepare("SELECT id, owner_id, name, type FROM assets WHERE id = ?")
      .bind(id)
      .first<unknown>();
    if (
      !isRecord(row) ||
      !isString(row.id) ||
      !isString(row.owner_id) ||
      !isString(row.name) ||
      !isAssetType(row.type)
    ) {
      return null;
    }
    return { id: row.id, owner_id: row.owner_id, name: row.name, type: row.type };
  }

  async #latestNotificationEventAt(taskId: string): Promise<number | null> {
    const row = await this.db
      .prepare(
        `SELECT MAX(occurred_at) AS latest
         FROM (
           SELECT json_extract(payload, '$.occurredAt') AS occurred_at
           FROM notification_event_outbox
           WHERE consumer = ? AND json_extract(payload, '$.maintenanceTaskId') = ?
           UNION ALL
           SELECT occurred_at FROM notification_ingested_events
           WHERE maintenance_task_id = ?
           UNION ALL
           SELECT last_event_occurred_at AS occurred_at FROM scheduled_reminders
           WHERE maintenance_task_id = ?
         )`,
      )
      .bind(NOTIFICATION_EVENTS_CONSUMER, taskId, taskId, taskId)
      .first<unknown>();
    if (!isRecord(row) || row.latest === null) return null;
    const occurredAt = timestampMilliseconds(row.latest);
    if (occurredAt === null)
      throw new InvariantError("Recovery notification evidence is malformed.");
    return occurredAt;
  }

  async #hasCreationDependents(change: AgentRowChange): Promise<boolean> {
    if (change.table === "assets") {
      return this.#exists(
        `SELECT EXISTS (
           SELECT 1 FROM maintenance_tasks WHERE asset_id = ?
           UNION ALL
           SELECT 1 FROM maintenance_records WHERE asset_id = ?
         ) AS found`,
        [change.id, change.id],
      );
    }
    if (change.table === "maintenance_tasks") {
      return this.#exists(
        "SELECT EXISTS (SELECT 1 FROM maintenance_records WHERE task_id = ?) AS found",
        [change.id],
      );
    }
    return false;
  }

  async #hasLaterTaskRecords(
    taskId: string,
    createdAt: string,
    changedRecordIds: string[],
  ): Promise<boolean> {
    const exclusions = changedRecordIds.map(() => "?").join(", ");
    const idExclusion = changedRecordIds.length > 0 ? `AND id NOT IN (${exclusions})` : "";
    return this.#exists(
      `SELECT EXISTS (
         SELECT 1 FROM maintenance_records
         WHERE task_id = ? AND created_at >= ? ${idExclusion}
       ) AS found`,
      [taskId, createdAt, ...changedRecordIds],
    );
  }

  async #exists(query: string, values: (string | number | null)[]): Promise<boolean> {
    const value = await this.db
      .prepare(query)
      .bind(...values)
      .first<unknown>("found");
    return value === 1 || value === true;
  }

  #buildTransaction(plan: RecoveryPlan, restoredAt: string): D1PreparedStatement[] {
    const guard = this.#buildGuard(plan);
    const statements: D1PreparedStatement[] = [guard];
    const changes = [...plan.changes].sort(compareCompensationOrder);
    for (const change of changes) {
      if (snapshotsEqual(change.before, change.after)) continue;
      statements.push(this.#compensationStatement(change, restoredAt));
    }
    for (const change of changes) {
      if (change.table !== "maintenance_tasks" || snapshotsEqual(change.before, change.after))
        continue;
      const event = { ...this.#taskConclusion(plan, change), occurredAt: new Date(restoredAt) };
      const outbox = prepareNotificationOutboxInsert(this.db, event);
      if (outbox === null)
        throw new InvariantError("Recovery schedule event could not be prepared.");
      statements.push(outbox);
    }
    statements.push(
      this.db
        .prepare(
          `UPDATE agent_operation_journal
           SET restored_at = ?
           WHERE actor_id = ? AND operation_id = ? AND restored_at IS NULL`,
        )
        .bind(restoredAt, plan.operation.actorId, plan.operation.operationId),
    );
    return statements;
  }

  #buildGuard(plan: RecoveryPlan): D1PreparedStatement {
    const conditions: string[] = [
      `EXISTS (
        SELECT 1 FROM agent_operation_journal
        WHERE actor_id = ? AND operation_id = ? AND restored_at IS NULL
      )`,
    ];
    const values: (string | number | null)[] = [plan.operation.actorId, plan.operation.operationId];

    for (const change of plan.changes) {
      if (change.after === null || !isCompleteSnapshot(change.table, change.after)) {
        throw new InvariantError("Recovery snapshot is incomplete.");
      }
      const current = plan.currentRows.get(rowKey(change.table, change.id));
      const journalEntryCount = plan.journalEntryCounts.get(rowKey(change.table, change.id));
      if (
        current === undefined ||
        !isCompleteSnapshot(change.table, current) ||
        journalEntryCount === undefined
      ) {
        throw new InvariantError("Recovery current state is unavailable.");
      }
      const predicates = SNAPSHOT_COLUMNS[change.table].map((column) => `${column} IS ?`);
      conditions.push(
        `EXISTS (SELECT 1 FROM ${change.table} WHERE id = ? AND ${predicates.join(" AND ")})`,
      );
      values.push(change.id, ...snapshotValues(change.table, current));
      conditions.push(
        `(SELECT COUNT(*)
          FROM agent_operation_journal AS entry
          WHERE entry.created_at >= ?
            AND NOT (entry.actor_id = ? AND entry.operation_id = ?)
            AND EXISTS (
              SELECT 1 FROM json_each(entry.snapshots_json, '$.changes') AS candidate
              WHERE json_extract(candidate.value, '$.table') = ?
                AND json_extract(candidate.value, '$.id') = ?
            )) = ?`,
      );
      values.push(
        plan.operation.createdAt,
        plan.operation.actorId,
        plan.operation.operationId,
        change.table,
        change.id,
        journalEntryCount,
      );

      if (change.before === null && change.table === "assets") {
        conditions.push(
          `NOT EXISTS (SELECT 1 FROM maintenance_tasks WHERE asset_id = ?)
           AND NOT EXISTS (SELECT 1 FROM maintenance_records WHERE asset_id = ?)`,
        );
        values.push(change.id, change.id);
      }
      if (change.before === null && change.table === "maintenance_tasks") {
        conditions.push("NOT EXISTS (SELECT 1 FROM maintenance_records WHERE task_id = ?)");
        values.push(change.id);
      }
      if (change.table === "maintenance_tasks" && change.before !== null) {
        const changedRecordIds = plan.changes
          .filter((candidate) => candidate.table === "maintenance_records")
          .map((candidate) => candidate.id);
        const exclusions = changedRecordIds.map(() => "?").join(", ");
        const idExclusion = changedRecordIds.length > 0 ? `AND id NOT IN (${exclusions})` : "";
        conditions.push(
          `NOT EXISTS (
             SELECT 1 FROM maintenance_records
             WHERE task_id = ? AND created_at >= ? ${idExclusion}
           )`,
        );
        values.push(change.id, plan.operation.createdAt, ...changedRecordIds);
      }
      if (change.table === "maintenance_tasks") {
        const asset = plan.assets.get(stringValue(change.after.asset_id));
        if (asset === undefined) throw new InvariantError("Recovery asset context is unavailable.");
        conditions.push(
          `EXISTS (
             SELECT 1 FROM assets
             WHERE id = ? AND owner_id = ? AND name IS ? AND type IS ?
           )`,
        );
        values.push(asset.id, asset.owner_id, asset.name, asset.type);
      }
    }

    return this.db
      .prepare(
        `INSERT INTO mutation_guards (name, assertion)
         VALUES ('cas_guard', (SELECT CASE WHEN ${conditions.join(" AND ")} THEN 1 ELSE 0 END))
         ON CONFLICT(name) DO UPDATE SET assertion = excluded.assertion`,
      )
      .bind(...values);
  }

  #compensationStatement(change: AgentRowChange, restoredAt: string): D1PreparedStatement {
    if (change.after === null || !isCompleteSnapshot(change.table, change.after)) {
      throw new InvariantError("Recovery snapshot is incomplete.");
    }
    if (change.before === null) {
      return this.db.prepare(`DELETE FROM ${change.table} WHERE id = ?`).bind(change.id);
    }

    const restoreColumns = SNAPSHOT_COLUMNS[change.table].filter(
      (column) =>
        column !== "id" &&
        column !== "revision" &&
        !(change.table === "assets" && column === "updated_at"),
    );
    const assignments = restoreColumns.map((column) => `${column} = ?`);
    const values = restoreColumns.map((column) => change.before?.[column] ?? null);
    if (change.table === "assets") {
      assignments.push("updated_at = ?", "revision = COALESCE(revision, 0) + 1");
      values.push(restoredAt);
    } else {
      assignments.push("revision = revision + 1");
    }
    return this.db
      .prepare(`UPDATE ${change.table} SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, change.id);
  }

  #taskConclusion(plan: RecoveryPlan, change: AgentRowChange): DomainEvent {
    const snapshot = change.before ?? change.after;
    if (snapshot === null) throw new InvariantError("Recovery task snapshot is unavailable.");
    const asset = plan.assets.get(stringValue(snapshot.asset_id));
    if (asset === undefined) throw new InvariantError("Recovery asset context is unavailable.");
    const common = {
      maintenanceTaskId: MaintenanceTaskId.from(change.id),
      assetId: AssetId.from(stringValue(snapshot.asset_id)),
      ownerId: UserId.from(stringValue(snapshot.owner_id)),
      actorId: UserId.from(plan.operation.actorId),
      assetName: asset.name,
      assetType: asset.type,
    };
    if (change.before === null) {
      return MaintenanceTaskDeleted({ ...common, title: stringValue(change.after?.title) });
    }
    return MaintenanceTaskUpdated({
      ...common,
      title: stringValue(change.before.title),
      intervalValue: numberValue(change.before.interval_value),
      intervalUnit: intervalUnitValue(change.before.interval_unit),
      nextDue: stringValue(change.before.next_due),
    });
  }
}

function isCompleteChange(change: AgentRowChange): boolean {
  return (
    change.after !== null &&
    isCompleteSnapshot(change.table, change.after) &&
    (change.before === null || isCompleteSnapshot(change.table, change.before))
  );
}

function isCompleteSnapshot(table: AgentRowTable, snapshot: AgentRowSnapshot): boolean {
  const keys = Object.keys(snapshot);
  return (
    keys.length === SNAPSHOT_COLUMNS[table].length &&
    SNAPSHOT_COLUMNS[table].every((column) => Object.hasOwn(snapshot, column))
  );
}

function isSemanticallyRestorable(operation: StoredAgentOperation): boolean {
  const { changes, receipt, tool } = operation;
  const assets = changes.filter((change) => change.table === "assets");
  const tasks = changes.filter((change) => change.table === "maintenance_tasks");
  const records = changes.filter((change) => change.table === "maintenance_records");
  if (
    receipt.operationId !== operation.operationId ||
    receipt.assetId === "" ||
    receipt.entityId === ""
  ) {
    return false;
  }

  if (tool === "create_asset" || tool === "edit_asset") {
    const asset = assets[0];
    return (
      changes.length === 1 &&
      asset !== undefined &&
      (tool === "create_asset" ? asset.before === null : asset.before !== null) &&
      asset.after !== null &&
      isCompleteSnapshot("assets", asset.after) &&
      (asset.before === null || isCompleteSnapshot("assets", asset.before)) &&
      receipt.entityType === "asset" &&
      receipt.entityId === asset.id &&
      receipt.assetId === asset.id &&
      revisionEquals(receipt.appliedRevision, asset.after)
    );
  }

  if (
    tool === "create_maintenance_task" ||
    tool === "edit_maintenance_task" ||
    tool === "reschedule_maintenance_task"
  ) {
    const task = tasks[0];
    return (
      changes.length === 1 &&
      task !== undefined &&
      (tool === "create_maintenance_task" ? task.before === null : task.before !== null) &&
      task.after !== null &&
      isCompleteSnapshot("maintenance_tasks", task.after) &&
      (task.before === null || isCompleteSnapshot("maintenance_tasks", task.before)) &&
      (task.before === null || task.before.asset_id === task.after.asset_id) &&
      receipt.entityType === "task" &&
      receipt.entityId === task.id &&
      receipt.assetId === stringValue(task.after.asset_id) &&
      revisionEquals(receipt.appliedRevision, task.after) &&
      receipt.linkedTask === undefined
    );
  }

  const record = records[0];
  if (
    record === undefined ||
    record.after === null ||
    !isCompleteSnapshot("maintenance_records", record.after)
  ) {
    return false;
  }
  if (tool !== "record_maintenance" && tool !== "edit_maintenance_record") return false;
  const recordCreating = tool === "record_maintenance";
  if (
    (recordCreating && record.before !== null) ||
    (!recordCreating &&
      (record.before === null || !isCompleteSnapshot("maintenance_records", record.before)))
  ) {
    return false;
  }
  if (assets.length !== 0 || records.length !== 1 || tasks.length > 1) return false;
  if (
    receipt.entityType !== "record" ||
    receipt.entityId !== record.id ||
    receipt.assetId !== stringValue(record.after.asset_id) ||
    !revisionEquals(receipt.appliedRevision, record.after)
  ) {
    return false;
  }
  if (record.before !== null && record.before.task_id !== record.after.task_id) return false;
  const task = tasks[0];
  if (task === undefined) return receipt.linkedTask === undefined;
  const validTask =
    task.before !== null &&
    task.after !== null &&
    isCompleteSnapshot("maintenance_tasks", task.before) &&
    isCompleteSnapshot("maintenance_tasks", task.after) &&
    isString(record.after.task_id) &&
    record.after.task_id === task.id &&
    isString(task.after.asset_id) &&
    task.after.asset_id === record.after.asset_id &&
    task.before.asset_id === task.after.asset_id;
  if (!validTask || task.before === null || task.after === null) return false;
  const taskChanged = !snapshotsEqual(task.before, task.after);
  const linkedTask = receipt.linkedTask;
  if (!taskChanged && linkedTask === undefined) return true;
  return (
    linkedTask !== undefined &&
    linkedTask.taskId === task.id &&
    linkedTask.appliedRevision === task.after.revision &&
    linkedTask.nextDue === task.after.next_due
  );
}

function revisionEquals(revision: number, snapshot: AgentRowSnapshot): boolean {
  return typeof snapshot.revision === "number" && revision === snapshot.revision;
}

function rowMatchesSnapshot(row: AgentRowSnapshot, snapshot: AgentRowSnapshot): boolean {
  return Object.keys(snapshot).every((column) => Object.is(row[column], snapshot[column]));
}

function rowKey(table: AgentRowTable, id: string): string {
  return `${table}:${id}`;
}

function timestampMilliseconds(value: unknown): number | null {
  if (!isString(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function compensatedStateMatches(
  table: AgentRowTable,
  targetAfter: AgentRowSnapshot,
  current: AgentRowSnapshot,
  laterChanges: LaterOperationChange[],
): boolean {
  const changed = laterChanges.filter(
    (entry) => !snapshotsEqual(entry.change.before, entry.change.after),
  );
  if (changed.length === 0) return rowMatchesSnapshot(current, targetAfter);

  for (const column of SNAPSHOT_COLUMNS[table]) {
    if (column === "revision" || (table === "assets" && column === "updated_at")) continue;
    if (!Object.is(current[column], targetAfter[column])) return false;
  }

  const latestAfter = laterChanges.at(-1)?.change.after;
  if (latestAfter === undefined || latestAfter === null) return false;
  const baseRevision = latestAfter.revision;
  if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) return false;
  const currentRevision = current.revision;
  if (currentRevision !== baseRevision + changed.length) return false;

  if (table === "assets") {
    const lastAppliedCompensation = changed[0]?.operation.restoredAt;
    if (lastAppliedCompensation === undefined || lastAppliedCompensation === null) return false;
    return current.updated_at === lastAppliedCompensation;
  }
  return true;
}

function snapshotsEqual(left: AgentRowSnapshot | null, right: AgentRowSnapshot | null): boolean {
  if (left === null || right === null) return left === right;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && Object.is(left[key], right[key]))
  );
}

function orderLaterChanges(
  targetAfter: AgentRowSnapshot,
  changes: LaterOperationChange[],
): LaterOperationChange[] | null {
  const remaining = [...changes];
  const ordered: LaterOperationChange[] = [];
  let expected = targetAfter;

  while (remaining.length > 0) {
    const candidates = remaining.filter(
      (entry) => entry.change.before !== null && snapshotsEqual(entry.change.before, expected),
    );
    const unchanged = candidates.filter((entry) =>
      snapshotsEqual(entry.change.before, entry.change.after),
    );
    const changed = candidates.filter(
      (entry) => !snapshotsEqual(entry.change.before, entry.change.after),
    );
    if (changed.length > 1 || (unchanged.length === 0 && changed.length === 0)) return null;

    for (const entry of unchanged) {
      ordered.push(entry);
      removeEntry(remaining, entry);
    }
    const next = changed[0];
    if (next !== undefined) {
      if (next.change.after === null) return null;
      ordered.push(next);
      removeEntry(remaining, next);
      expected = next.change.after;
    }
  }
  return ordered;
}

function classifySameTimestampChanges(
  target: AgentRowChange,
  entries: LaterOperationChange[],
): LaterOperationChange[] | null {
  if (target.after === null) return entries.length === 0 ? [] : null;
  const remaining = [...entries];
  const later: LaterOperationChange[] = [];
  let state: AgentRowSnapshot | null = target.after;

  while (state !== null) {
    const candidates = remaining.filter(
      (entry) => entry.change.before !== null && snapshotsEqual(entry.change.before, state),
    );
    const unchanged = candidates.filter((entry) =>
      snapshotsEqual(entry.change.before, entry.change.after),
    );
    const changed = candidates.filter(
      (entry) => !snapshotsEqual(entry.change.before, entry.change.after),
    );
    if (changed.length > 1) return null;
    for (const entry of unchanged) {
      later.push(entry);
      removeEntry(remaining, entry);
    }
    const next = changed[0];
    if (next === undefined) break;
    if (next.change.after === null) return null;
    later.push(next);
    removeEntry(remaining, next);
    state = next.change.after;
  }

  state = target.before;
  while (state !== null) {
    const candidates = remaining.filter((entry) => snapshotsEqual(entry.change.after, state));
    const unchanged = candidates.filter((entry) =>
      snapshotsEqual(entry.change.before, entry.change.after),
    );
    const changed = candidates.filter(
      (entry) => !snapshotsEqual(entry.change.before, entry.change.after),
    );
    if (changed.length > 1) return null;
    for (const entry of unchanged) removeEntry(remaining, entry);
    const previous = changed[0];
    if (previous === undefined) break;
    removeEntry(remaining, previous);
    state = previous.change.before;
  }

  return remaining.length === 0 ? later : null;
}

function removeEntry(entries: LaterOperationChange[], target: LaterOperationChange): void {
  const index = entries.indexOf(target);
  if (index < 0) throw new InvariantError("Recovery chain evidence is malformed.");
  entries.splice(index, 1);
}

function snapshotValues(
  table: AgentRowTable,
  snapshot: AgentRowSnapshot,
): (string | number | null)[] {
  return SNAPSHOT_COLUMNS[table].map((column) => {
    const value = snapshot[column];
    if (value === null || typeof value === "string" || typeof value === "number") return value;
    throw new InvariantError("Recovery snapshot value is malformed.");
  });
}

function compareCompensationOrder(left: AgentRowChange, right: AgentRowChange): number {
  return compensationOrder(left) - compensationOrder(right);
}

function compensationOrder(change: AgentRowChange): number {
  if (change.before === null) {
    if (change.table === "maintenance_records") return 0;
    if (change.table === "maintenance_tasks") return 1;
    return 2;
  }
  if (change.table === "maintenance_tasks") return 3;
  if (change.table === "maintenance_records") return 4;
  return 5;
}

function reportFor(operation: StoredAgentOperation): AgentOperationRecoveryReport {
  return {
    operationId: operation.operationId,
    status: "found",
    tool: operation.tool,
    createdAt: operation.createdAt,
    restoredAt: operation.restoredAt,
    affectedRows: operation.changes.length,
    changedRows: operation.changes.filter((change) => !snapshotsEqual(change.before, change.after))
      .length,
    reasonCodes: [],
  };
}

function emptyReport(operationId: string, status: "not_found"): AgentOperationRecoveryReport {
  return {
    operationId,
    status,
    tool: null,
    createdAt: null,
    restoredAt: null,
    affectedRows: 0,
    changedRows: 0,
    reasonCodes: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSnapshot(value: Record<string, unknown>): value is AgentRowSnapshot {
  return Object.values(value).every(
    (field) => field === null || typeof field === "string" || typeof field === "number",
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new InvariantError("Recovery snapshot value is malformed.");
  return value;
}

function numberValue(value: unknown): number {
  if (typeof value !== "number") throw new InvariantError("Recovery snapshot value is malformed.");
  return value;
}

function isAssetType(value: unknown): value is AssetType {
  return value === "vehicle" || value === "property" || value === "equipment";
}

function intervalUnitValue(value: unknown): IntervalUnit {
  if (value === "day" || value === "week" || value === "month" || value === "year") return value;
  throw new InvariantError("Recovery snapshot value is malformed.");
}
