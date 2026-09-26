import {
  ConflictError,
  DomainError as DomainErrorClass,
  ForbiddenError,
  InvariantError,
  NotFoundError,
  ValidationError,
  AssetId,
  err,
  ok,
  type DomainError,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type {
  AgentMutationCommand,
  AgentMutationReceipt,
  AgentOperationExecutor,
} from "../../../application/ports/AgentOperationExecutor.ts";
import type { Asset } from "../../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../../domain/asset/AssetRepository.ts";
import type { DomainEvent } from "../../../domain/events/DomainEvent.ts";
import type { MaintenanceRecord } from "../../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceRecordRepository } from "../../../domain/maintenance/MaintenanceRecordRepository.ts";
import type { MaintenanceTask } from "../../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../../domain/maintenance/MaintenanceTaskRepository.ts";
import type { MaintenanceRecordWriter } from "../../../application/ports/MaintenanceRecordWriter.ts";
import type { MaintenanceTaskWriter } from "../../../application/ports/MaintenanceTaskWriter.ts";
import type { TeamRepository } from "../../../domain/team/TeamRepository.ts";
import type { EventBus } from "../../../application/ports/EventBus.ts";
import type { MaintenanceWriteGate } from "../../../application/ports/MaintenanceWriteGate.ts";
import type { UtcDateProvider } from "../../../application/ports/UtcDateProvider.ts";
import type {
  AgentRowChange,
  AgentRowSnapshot,
  AgentRowTable,
} from "../recovery/AgentJournalTypes.ts";
import { D1AgentOperationJournal, hashAgentInput } from "../recovery/D1AgentOperationJournal.ts";
import { CreateAsset } from "../../../application/usecases/CreateAsset.ts";
import { EditAsset } from "../../../application/usecases/EditAsset.ts";
import { PatchAgentAsset } from "../../../application/usecases/PatchAgentAsset.ts";
import { CreateMaintenanceTask } from "../../../application/usecases/CreateMaintenanceTask.ts";
import { UpdateMaintenanceTask } from "../../../application/usecases/UpdateMaintenanceTask.ts";
import { RescheduleMaintenanceTask } from "../../../application/usecases/RescheduleMaintenanceTask.ts";
import { CreateMaintenanceRecord } from "../../../application/usecases/CreateMaintenanceRecord.ts";
import { UpdateMaintenanceRecord } from "../../../application/usecases/UpdateMaintenanceRecord.ts";
import { canAccessAsset } from "../../../application/usecases/assetAccess.ts";
import {
  D1AssetRepository,
  prepareAssetInsert,
  prepareAssetUpdateWithRevision,
} from "../../persistence/D1AssetRepository.ts";
import {
  D1MaintenanceTaskRepository,
  prepareMaintenanceTaskInsert,
  prepareMaintenanceTaskUpdateWithRevision,
} from "../../persistence/D1MaintenanceTaskRepository.ts";
import {
  D1MaintenanceRecordRepository,
  prepareMaintenanceRecordInsert,
  prepareMaintenanceRecordUpdateWithRevision,
} from "../../persistence/D1MaintenanceRecordRepository.ts";
import { prepareMaintenanceOutboxInserts } from "../../persistence/D1MaintenanceOutboxStatements.ts";

export type D1AgentOperationExecutorDependencies = {
  db: D1Database;
  teams: TeamRepository;
  eventBus: EventBus;
  dates: UtcDateProvider;
  writeGate?: MaintenanceWriteGate;
};

const SNAPSHOT_COLUMNS: Record<AgentRowTable, string> = {
  assets:
    "id, owner_id, name, type, metadata, archived_at, created_at, updated_at, shared_team_id, revision",
  maintenance_tasks:
    "id, asset_id, owner_id, title, interval_value, interval_unit, last_completed_date, next_due, created_at, schedule_seed_date, initial_last_completed_date, revision, next_due_override",
  maintenance_records:
    "id, asset_id, owner_id, title, performed_at, notes, created_at, task_id, revision",
};

/** Stages existing application use cases and commits their writes through the private operation journal. */
export class D1AgentOperationExecutor implements AgentOperationExecutor {
  private readonly journal: D1AgentOperationJournal;
  private readonly assets: D1AssetRepository;
  private readonly tasks: D1MaintenanceTaskRepository;
  private readonly records: D1MaintenanceRecordRepository;

  constructor(private readonly dependencies: D1AgentOperationExecutorDependencies) {
    this.journal = new D1AgentOperationJournal(dependencies.db);
    this.assets = new D1AssetRepository(dependencies.db);
    this.tasks = new D1MaintenanceTaskRepository(dependencies.db);
    this.records = new D1MaintenanceRecordRepository(dependencies.db);
  }

  async execute(
    requesterId: UserId,
    command: AgentMutationCommand,
  ): Promise<Result<AgentMutationReceipt, DomainError>> {
    try {
      if (
        command.kind === "record_maintenance" &&
        command.taskId !== undefined &&
        command.expectedTaskRevision === undefined
      ) {
        return err(
          new ValidationError("A linked task revision is required", "expectedTaskRevision"),
        );
      }
      const existing = await this.journal.find(requesterId, command.operationId);
      if (existing !== null) {
        const inputHash = await hashAgentInput(command.kind, command);
        if (existing.tool !== command.kind || existing.inputHash !== inputHash) {
          return err(new ConflictError("This operation ID was already used with different input."));
        }
        const authorization = await this.#authorizeReplay(requesterId, command, existing.receipt);
        if (!authorization.ok) return authorization;
        return ok({ ...existing.receipt, replayed: true });
      }

      const session = new MutationSession(this.dependencies.db, command);
      const staged = new StagedRepositories(session, this.assets, this.tasks, this.records);
      const result = await this.#runUseCase(requesterId, command, staged);
      if (!result.ok) return result;

      const receipt = createReceipt(command, result.value, session);
      const committed = await this.journal.commit({
        actorId: requesterId,
        operationId: command.operationId,
        tool: command.kind,
        input: command,
        receipt,
        changes: session.changes(),
        statements: [
          ...prepareAgentGuards(
            this.dependencies.db,
            requesterId,
            command,
            session,
            this.dependencies.writeGate !== undefined,
          ),
          ...session.statements,
          ...prepareMaintenanceOutboxInserts(this.dependencies.db, session.events),
        ],
      });
      if (committed.replayed) {
        const authorization = await this.#authorizeReplay(requesterId, command, committed);
        if (!authorization.ok) return authorization;
      }
      if (!committed.replayed && session.events.length > 0) {
        try {
          await this.dependencies.eventBus.publishAll(session.events);
        } catch {
          // The domain rows and durable outboxes already committed; a telemetry subscriber cannot undo that receipt.
        }
      }
      return ok(committed);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      if (isAgentGuardFailure(error)) {
        return err(new ConflictError("The asset or maintenance state changed; refresh and retry."));
      }
      throw error;
    }
  }

  async #runUseCase(
    requesterId: UserId,
    command: AgentMutationCommand,
    staged: StagedRepositories,
  ): Promise<Result<AssetId | Asset | MaintenanceTask | MaintenanceRecord, DomainError>> {
    const eventBus = staged.eventBus;
    const { teams, dates, writeGate } = this.dependencies;
    switch (command.kind) {
      case "create_asset":
        return new CreateAsset(staged.assets, eventBus).execute({
          ownerId: requesterId,
          name: command.name,
          metadata: command.metadata,
        });
      case "edit_asset": {
        const edit = new EditAsset(staged.assets, teams, eventBus);
        return new PatchAgentAsset(staged.assets, edit).execute({
          assetId: command.assetId,
          requesterId,
          expectedRevision: command.expectedRevision,
          ...(command.name !== undefined ? { name: command.name } : {}),
          ...(command.metadata !== undefined ? { metadata: command.metadata } : {}),
        });
      }
      case "create_maintenance_task":
        return new CreateMaintenanceTask(
          staged.assets,
          teams,
          staged.tasks,
          eventBus,
          dates,
          writeGate,
        ).execute({
          assetId: command.assetId,
          requesterId,
          title: command.title,
          intervalValue: command.intervalValue,
          intervalUnit: command.intervalUnit,
          ...(command.lastCompletedDate !== undefined
            ? { lastCompletedDate: command.lastCompletedDate }
            : {}),
        });
      case "edit_maintenance_task":
        return new UpdateMaintenanceTask(
          staged.assets,
          teams,
          staged.tasks,
          eventBus,
          dates,
          writeGate,
        ).execute({
          assetId: command.assetId,
          taskId: command.taskId,
          requesterId,
          expectedRevision: command.expectedRevision,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.intervalValue !== undefined ? { intervalValue: command.intervalValue } : {}),
          ...(command.intervalUnit !== undefined ? { intervalUnit: command.intervalUnit } : {}),
        });
      case "reschedule_maintenance_task":
        return new RescheduleMaintenanceTask(
          staged.assets,
          teams,
          staged.tasks,
          staged.tasks,
          eventBus,
          dates,
          writeGate,
        ).execute({
          assetId: command.assetId,
          taskId: command.taskId,
          requesterId,
          expectedRevision: command.expectedRevision,
          nextDue: command.nextDue,
        });
      case "record_maintenance":
        return new CreateMaintenanceRecord(
          staged.assets,
          teams,
          staged.records,
          staged.tasks,
          eventBus,
          dates,
          writeGate,
        ).execute({
          assetId: command.assetId,
          requesterId,
          title: command.title,
          performedAt: command.performedAt,
          ...(command.notes !== undefined ? { notes: command.notes } : {}),
          ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
          ...(command.expectedTaskRevision !== undefined
            ? { expectedTaskRevision: command.expectedTaskRevision }
            : {}),
        });
      case "edit_maintenance_record":
        return new UpdateMaintenanceRecord(
          staged.assets,
          teams,
          staged.records,
          staged.records,
          staged.tasks,
          eventBus,
          dates,
          writeGate,
        ).execute({
          assetId: command.assetId,
          recordId: command.recordId,
          requesterId,
          expectedRevision: command.expectedRevision,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.performedAt !== undefined ? { performedAt: command.performedAt } : {}),
          ...(command.notes !== undefined ? { notes: command.notes } : {}),
        });
    }
  }

  async #authorizeReplay(
    requesterId: UserId,
    command: AgentMutationCommand,
    receipt: Pick<AgentMutationReceipt, "assetId">,
  ): Promise<Result<void, DomainError>> {
    if (command.kind === "create_asset") {
      const asset = await this.assets.findById(AssetId.from(receipt.assetId));
      if (!asset) return err(new NotFoundError("Asset not found"));
      return asset.ownerId === requesterId
        ? ok(undefined)
        : err(new ForbiddenError("Access denied"));
    }

    const asset = await this.assets.findById(command.assetId);
    if (!asset) return err(new NotFoundError("Asset not found"));
    if (command.kind === "edit_asset") {
      if (asset.ownerId !== requesterId) {
        const visible = await canAccessAsset(asset, requesterId, this.dependencies.teams);
        if (!visible) return err(new ForbiddenError("Access denied"));
        return err(new ForbiddenError("Only the asset owner can edit this asset"));
      }
      return ok(undefined);
    }

    if (!(await canAccessAsset(asset, requesterId, this.dependencies.teams))) {
      return err(new ForbiddenError("Access denied"));
    }
    if (
      command.kind === "edit_maintenance_task" ||
      command.kind === "reschedule_maintenance_task"
    ) {
      const task = await this.tasks.findById(command.taskId);
      if (!task || task.assetId !== command.assetId) {
        return err(new NotFoundError("Maintenance task not found"));
      }
    }
    if (command.kind === "edit_maintenance_record") {
      const record = await this.records.findById(command.recordId);
      if (!record || record.assetId !== command.assetId) {
        return err(new NotFoundError("Maintenance record not found"));
      }
    }
    return ok(undefined);
  }
}

type StagedEntity = Asset | MaintenanceTask | MaintenanceRecord;

class MutationSession {
  readonly events: DomainEvent[] = [];
  readonly statements: D1PreparedStatement[] = [];
  readonly sourceAssets = new Map<string, { revision: number; row: AgentRowSnapshot }>();
  readonly sourceTasks = new Map<string, { revision: number; row: AgentRowSnapshot }>();
  readonly sourceRecords = new Map<string, { revision: number; row: AgentRowSnapshot }>();
  readonly recordSets: Array<{ taskId: string; recordIds: string[] }> = [];
  readonly stagedRows = new Map<string, AgentRowChange>();

  constructor(
    private readonly db: D1Database,
    readonly command: AgentMutationCommand,
  ) {}

  async observe(
    table: AgentRowTable,
    id: string,
    revision: number,
    observedEntity: AgentRowSnapshot,
  ): Promise<void> {
    const source = this.sourceMap(table);
    const previous = source.get(id);
    if (previous !== undefined) {
      if (!snapshotsMatch(table, previous.row, observedEntity)) {
        throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
      }
      return;
    }
    const row = await this.readRow(table, id);
    if (row === null) {
      throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
    }
    const storedRevision = row.revision;
    const normalizedRevision =
      table === "assets" ? Number(storedRevision ?? 0) : Number(storedRevision);
    if (normalizedRevision !== revision) {
      throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
    }
    if (!snapshotsMatch(table, row, observedEntity)) {
      throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
    }
    source.set(id, { revision, row });
  }

  async observeRecordSet(
    taskId: string,
    observedRecords: readonly MaintenanceRecord[],
  ): Promise<void> {
    const result = await this.db
      .prepare(
        `SELECT ${SNAPSHOT_COLUMNS.maintenance_records}
         FROM maintenance_records WHERE task_id = ?`,
      )
      .bind(taskId)
      .all<Record<string, unknown>>();
    const persistedRows = result.results.map(snapshotFromRow);
    const persistedById = new Map(persistedRows.map((row) => [String(row.id), row]));
    const observedById = new Map(observedRecords.map((record) => [String(record.id), record]));
    const observedIds = [...observedById.keys()].sort();
    const persistedIds = [...persistedById.keys()].sort();
    if (
      observedById.size !== observedRecords.length ||
      persistedById.size !== persistedRows.length ||
      JSON.stringify(observedIds) !== JSON.stringify(persistedIds)
    ) {
      throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
    }

    for (const [id, record] of observedById) {
      const row = persistedById.get(id);
      if (
        row === undefined ||
        Number(row.revision) !== record.revision ||
        !snapshotsMatch("maintenance_records", row, snapshotRecord(record))
      ) {
        throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
      }
      const existing = this.sourceRecords.get(id);
      if (existing !== undefined && !snapshotsEqual(existing.row, row)) {
        throw new ConflictError("The asset or maintenance state changed; refresh and retry.");
      }
      if (existing === undefined) {
        this.sourceRecords.set(id, { revision: record.revision, row });
      }
    }
  }

  async captureBefore(table: AgentRowTable, id: string): Promise<AgentRowSnapshot | null> {
    const staged = this.stagedRows.get(rowKey(table, id));
    if (staged !== undefined) return staged.before;
    const source = this.sourceMap(table).get(id);
    if (source !== undefined) return source.row;
    return this.readRow(table, id);
  }

  async stageAsset(asset: Asset): Promise<void> {
    const id = String(asset.id);
    const creating = this.command.kind === "create_asset";
    const before = creating ? null : await this.captureBefore("assets", id);
    if (creating) {
      this.statements.push(prepareAssetInsert(this.db, asset));
    } else {
      const expected = Math.max(0, asset.revision - 1);
      this.statements.push(prepareAssetUpdateWithRevision(this.db, asset, expected));
      this.statements.push(
        prepareAssertion(
          this.db,
          "EXISTS (SELECT 1 FROM assets WHERE id = ? AND COALESCE(revision, 0) = ?)",
          [id, expected + 1],
        ),
      );
    }
    this.addChange("assets", id, before, snapshotAsset(asset));
  }

  async stageTask(task: MaintenanceTask, expectedRevision?: number): Promise<void> {
    const id = String(task.id);
    const creating = this.command.kind === "create_maintenance_task";
    const before = creating ? null : await this.captureBefore("maintenance_tasks", id);
    const expected = expectedRevision ?? Math.max(0, task.revision - 1);
    if (creating) {
      this.statements.push(prepareMaintenanceTaskInsert(this.db, task));
    } else {
      this.statements.push(prepareMaintenanceTaskUpdateWithRevision(this.db, task, expected));
      this.statements.push(
        prepareAssertion(
          this.db,
          "EXISTS (SELECT 1 FROM maintenance_tasks WHERE id = ? AND revision = ?)",
          [id, expected + 1],
        ),
      );
    }
    this.addChange("maintenance_tasks", id, before, snapshotTask(task));
  }

  async stageRecord(record: MaintenanceRecord, expectedRevision?: number): Promise<void> {
    const id = String(record.id);
    const creating = this.command.kind === "record_maintenance";
    const before = creating ? null : await this.captureBefore("maintenance_records", id);
    const expected = expectedRevision ?? Math.max(0, record.revision - 1);
    if (creating) {
      this.statements.push(prepareMaintenanceRecordInsert(this.db, record));
    } else {
      this.statements.push(prepareMaintenanceRecordUpdateWithRevision(this.db, record, expected));
      this.statements.push(
        prepareAssertion(
          this.db,
          "EXISTS (SELECT 1 FROM maintenance_records WHERE id = ? AND revision = ?)",
          [id, expected + 1],
        ),
      );
    }
    this.addChange("maintenance_records", id, before, snapshotRecord(record));
  }

  changes(): AgentRowChange[] {
    if (this.stagedRows.size > 0) return [...this.stagedRows.values()];
    const target = noOpTarget(this.command);
    if (target === null) return [];
    const before = this.sourceMap(target.table).get(target.id)?.row;
    if (before === undefined) return [];
    return [{ table: target.table, id: target.id, before: { ...before }, after: { ...before } }];
  }

  private addChange(
    table: AgentRowTable,
    id: string,
    before: AgentRowSnapshot | null,
    after: AgentRowSnapshot,
  ): void {
    this.stagedRows.set(rowKey(table, id), { table, id, before, after });
  }

  private sourceMap(
    table: AgentRowTable,
  ): Map<string, { revision: number; row: AgentRowSnapshot }> {
    switch (table) {
      case "assets":
        return this.sourceAssets;
      case "maintenance_tasks":
        return this.sourceTasks;
      case "maintenance_records":
        return this.sourceRecords;
    }
  }

  private async readRow(table: AgentRowTable, id: string): Promise<AgentRowSnapshot | null> {
    const row = await this.db
      .prepare(`SELECT ${SNAPSHOT_COLUMNS[table]} FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<Record<string, unknown>>();
    if (row === null) return null;
    return snapshotFromRow(row);
  }
}

function snapshotFromRow(row: Record<string, unknown>): AgentRowSnapshot {
  const snapshot: AgentRowSnapshot = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" || typeof value === "number" || value === null) {
      snapshot[key] = value;
    } else {
      throw new InvariantError("A domain row has an unsupported recovery value.");
    }
  }
  return snapshot;
}

class StagedRepositories {
  readonly eventBus: EventBus;
  readonly assets: AssetRepository;
  readonly tasks: MaintenanceTaskRepository & MaintenanceTaskWriter;
  readonly records: MaintenanceRecordRepository & MaintenanceRecordWriter;

  constructor(
    private readonly session: MutationSession,
    private readonly assetSource: AssetRepository,
    private readonly taskSource: MaintenanceTaskRepository & MaintenanceTaskWriter,
    private readonly recordSource: MaintenanceRecordRepository & MaintenanceRecordWriter,
  ) {
    this.eventBus = {
      publish: (event) => {
        this.session.events.push(event);
        return Promise.resolve();
      },
      publishAll: (events) => {
        this.session.events.push(...events);
        return Promise.resolve();
      },
      subscribe: () => undefined,
    };
    this.assets = {
      findById: async (id) => {
        const asset = await this.assetSource.findById(id);
        if (asset) {
          await this.session.observe(
            "assets",
            String(asset.id),
            asset.revision,
            snapshotAsset(asset),
          );
        }
        return asset;
      },
      findVisibleTo: (userId) => this.assetSource.findVisibleTo(userId),
      save: async (asset) => this.session.stageAsset(asset),
    };
    this.tasks = {
      findByAsset: (assetId) => this.taskSource.findByAsset(assetId),
      findForVisibleActiveAssets: (userId) => this.taskSource.findForVisibleActiveAssets(userId),
      findById: async (id) => {
        const task = await this.taskSource.findById(id);
        if (task) {
          await this.session.observe(
            "maintenance_tasks",
            String(task.id),
            task.revision,
            snapshotTask(task),
          );
        }
        return task;
      },
      save: async (task) => this.session.stageTask(task),
      delete: () =>
        Promise.reject(new InvariantError("Agent operations cannot delete maintenance tasks.")),
      updateWithRevision: async (task, expectedRevision) => {
        await this.session.stageTask(task, expectedRevision);
        return true;
      },
    };
    this.records = {
      findById: async (id) => {
        const record = await this.recordSource.findById(id);
        if (record) {
          await this.session.observe(
            "maintenance_records",
            String(record.id),
            record.revision,
            snapshotRecord(record),
          );
        }
        return record;
      },
      findByAsset: (assetId, ownerId) => this.recordSource.findByAsset(assetId, ownerId),
      findByTask: async (taskId) => {
        const records = await this.recordSource.findByTask(taskId);
        this.session.recordSets.push({
          taskId: String(taskId),
          recordIds: records.map((record) => String(record.id)).sort(),
        });
        await this.session.observeRecordSet(String(taskId), records);
        return records;
      },
      save: async (record, advancedTask: MaintenanceTask | null = null) => {
        await this.session.stageRecord(record);
        if (advancedTask !== null) {
          const expected = this.session.sourceTasks.get(String(advancedTask.id))?.revision;
          await this.session.stageTask(advancedTask, expected);
        }
      },
      update: async (record, expectedRecordRevision, reconciledTask, expectedTaskRevision) => {
        await this.session.stageRecord(record, expectedRecordRevision);
        if (reconciledTask !== null && expectedTaskRevision !== undefined) {
          await this.session.stageTask(reconciledTask, expectedTaskRevision);
        }
        return true;
      },
      delete: () =>
        Promise.reject(new InvariantError("Agent operations cannot delete maintenance records.")),
    };
  }
}

function prepareAgentGuards(
  db: D1Database,
  requesterId: UserId,
  command: AgentMutationCommand,
  session: MutationSession,
  checkWriteGate: boolean,
): D1PreparedStatement[] {
  const guards: D1PreparedStatement[] = [];
  const assert = (predicate: string, values: unknown[]) =>
    guards.push(prepareAssertion(db, predicate, values));
  for (const [id, source] of session.sourceAssets) {
    assertSnapshot("assets", id, source.row, assert);
  }
  for (const [id, source] of session.sourceTasks) {
    assertSnapshot("maintenance_tasks", id, source.row, assert);
  }
  assertRecordSnapshots(
    [...session.sourceRecords.values()].map((source) => source.row),
    assert,
  );
  const assertAsset = (
    assetId: string,
    expectedRevision: number,
    ownerOnly: boolean,
    mustBeActive: boolean,
  ) => {
    const access = ownerOnly
      ? "a.owner_id = ?"
      : "(a.owner_id = ? OR a.shared_team_id IN (SELECT team_id FROM team_members WHERE user_id = ?))";
    const accessValues = ownerOnly ? [requesterId] : [requesterId, requesterId];
    assert(
      `EXISTS (
        SELECT 1 FROM assets a
        WHERE a.id = ? AND COALESCE(a.revision, 0) = ? AND ${access}
          ${mustBeActive ? "AND a.archived_at IS NULL" : ""}
      )`,
      [assetId, expectedRevision, ...accessValues],
    );
  };
  const assertWritable = () => {
    if (checkWriteGate) {
      assert("EXISTS (SELECT 1 FROM maintenance_write_gate WHERE id = 1 AND mode = 'open')", []);
    }
  };

  switch (command.kind) {
    case "create_asset": {
      const id = [...session.stagedRows.values()].find((row) => row.table === "assets")?.id ?? "";
      assert("NOT EXISTS (SELECT 1 FROM assets WHERE id = ?)", [id]);
      break;
    }
    case "edit_asset":
      assertAsset(String(command.assetId), command.expectedRevision, true, false);
      break;
    case "create_maintenance_task": {
      const source = session.sourceAssets.get(String(command.assetId));
      assertWritable();
      assertAsset(String(command.assetId), source?.revision ?? 0, false, true);
      break;
    }
    case "edit_maintenance_task":
    case "reschedule_maintenance_task": {
      const source = session.sourceAssets.get(String(command.assetId));
      assertWritable();
      assertAsset(String(command.assetId), source?.revision ?? 0, false, false);
      assert(
        "EXISTS (SELECT 1 FROM maintenance_tasks WHERE id = ? AND asset_id = ? AND revision = ?)",
        [String(command.taskId), String(command.assetId), command.expectedRevision],
      );
      break;
    }
    case "record_maintenance": {
      const source = session.sourceAssets.get(String(command.assetId));
      assertWritable();
      assertAsset(String(command.assetId), source?.revision ?? 0, false, true);
      if (command.taskId !== undefined && command.expectedTaskRevision !== undefined) {
        assert(
          "EXISTS (SELECT 1 FROM maintenance_tasks WHERE id = ? AND asset_id = ? AND revision = ?)",
          [String(command.taskId), String(command.assetId), command.expectedTaskRevision],
        );
      }
      break;
    }
    case "edit_maintenance_record": {
      const source = session.sourceAssets.get(String(command.assetId));
      assertWritable();
      assertAsset(String(command.assetId), source?.revision ?? 0, false, true);
      assert(
        "EXISTS (SELECT 1 FROM maintenance_records WHERE id = ? AND asset_id = ? AND revision = ?)",
        [String(command.recordId), String(command.assetId), command.expectedRevision],
      );
      for (const set of session.recordSets) {
        assert(
          `(SELECT json_group_array(id)
            FROM (SELECT id FROM maintenance_records WHERE task_id = ? ORDER BY id)) IS ?`,
          [set.taskId, JSON.stringify(set.recordIds)],
        );
      }
      break;
    }
  }
  return guards;
}

function assertSnapshot(
  table: AgentRowTable,
  id: string,
  snapshot: AgentRowSnapshot,
  assert: (predicate: string, values: unknown[]) => void,
): void {
  const entries = Object.entries(snapshot);
  const predicate = `EXISTS (
    SELECT 1 FROM ${table} WHERE ${entries.map(([column]) => `${column} IS ?`).join(" AND ")}
  )`;
  const values = entries.map(([, value]) => value);
  if (!Object.hasOwn(snapshot, "id") || snapshot.id !== id) {
    throw new InvariantError("A recovery snapshot does not match its row identifier.");
  }
  assert(predicate, values);
}

function assertRecordSnapshots(
  snapshots: AgentRowSnapshot[],
  assert: (predicate: string, values: unknown[]) => void,
): void {
  const columns = SNAPSHOT_COLUMNS.maintenance_records.split(", ");
  const matchesRow = columns
    .map((column) => `actual.${column} IS json_extract(expected.value, '$.${column}')`)
    .join(" AND ");
  for (const group of chunk(snapshots, 40)) {
    assert(
      `NOT EXISTS (
        SELECT 1 FROM json_each(?) AS expected
        WHERE NOT EXISTS (
          SELECT 1 FROM maintenance_records AS actual WHERE ${matchesRow}
        )
      )`,
      [JSON.stringify(group)],
    );
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function prepareAssertion(
  db: D1Database,
  predicate: string,
  values: unknown[],
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO mutation_guards (name, assertion)
       VALUES ('agent_operation_guard', CASE WHEN ${predicate} THEN 1 ELSE 0 END)
       ON CONFLICT(name) DO UPDATE SET assertion = excluded.assertion`,
    )
    .bind(...values);
}

function createReceipt(
  command: AgentMutationCommand,
  entity: AssetId | StagedEntity,
  session: MutationSession,
): Omit<AgentMutationReceipt, "replayed"> {
  let entityType: AgentMutationReceipt["entityType"];
  let assetId: string;
  if (typeof entity === "string") {
    entityType = "asset";
    assetId = String(entity);
  } else if (isAsset(entity)) {
    entityType = "asset";
    assetId = String(entity.id);
  } else if (isTask(entity)) {
    entityType = "task";
    assetId = String(entity.assetId);
  } else {
    entityType = "record";
    assetId = String(entity.assetId);
  }

  const receipt: Omit<AgentMutationReceipt, "replayed"> = {
    operationId: command.operationId,
    entityType,
    entityId: typeof entity === "string" ? String(entity) : String(entity.id),
    assetId,
    appliedRevision: typeof entity === "string" ? 0 : entity.revision,
  };
  const linkedTaskId =
    command.kind === "record_maintenance"
      ? command.taskId
      : command.kind === "edit_maintenance_record"
        ? isRecordEntity(entity)
          ? String(entity.taskId ?? "")
          : ""
        : undefined;
  if (linkedTaskId !== undefined && linkedTaskId !== "") {
    const taskChange = session.stagedRows.get(rowKey("maintenance_tasks", String(linkedTaskId)));
    if (taskChange?.after) {
      receipt.linkedTask = {
        taskId: String(linkedTaskId),
        appliedRevision: Number(taskChange.after.revision ?? 0),
        nextDue: String(taskChange.after.next_due ?? ""),
      };
    }
  }
  return receipt;
}

function snapshotAsset(asset: Asset): AgentRowSnapshot {
  return {
    id: String(asset.id),
    owner_id: String(asset.ownerId),
    name: asset.name,
    type: asset.type,
    metadata: JSON.stringify(asset.metadata),
    archived_at: asset.archivedAt?.toISOString() ?? null,
    created_at: asset.createdAt.toISOString(),
    updated_at: asset.updatedAt.toISOString(),
    shared_team_id: asset.sharedTeamId === null ? null : String(asset.sharedTeamId),
    revision: asset.revision,
  };
}

function snapshotTask(task: MaintenanceTask): AgentRowSnapshot {
  return {
    id: String(task.id),
    asset_id: String(task.assetId),
    owner_id: String(task.ownerId),
    title: task.title,
    interval_value: task.intervalValue,
    interval_unit: task.intervalUnit,
    last_completed_date: task.lastCompletedDate,
    next_due: task.nextDue,
    created_at: task.createdAt.toISOString(),
    schedule_seed_date: task.scheduleSeedDate,
    initial_last_completed_date: task.initialLastCompletedDate,
    revision: task.revision,
    next_due_override: task.nextDueOverride,
  };
}

function snapshotRecord(record: MaintenanceRecord): AgentRowSnapshot {
  return {
    id: String(record.id),
    asset_id: String(record.assetId),
    owner_id: String(record.ownerId),
    title: record.title,
    performed_at: record.performedAt,
    notes: record.notes,
    created_at: record.createdAt.toISOString(),
    task_id: record.taskId === null ? null : String(record.taskId),
    revision: record.revision,
  };
}

function snapshotsMatch(
  table: AgentRowTable,
  stored: AgentRowSnapshot,
  entity: AgentRowSnapshot,
): boolean {
  for (const [column, expected] of Object.entries(entity)) {
    if (table === "assets" && column === "revision") continue;
    const actual = stored[column];
    if (table === "assets" && column === "metadata") {
      if (stableJson(actual) !== stableJson(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function snapshotsEqual(left: AgentRowSnapshot, right: AgentRowSnapshot): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && left[key] === right[key])
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function rowKey(table: AgentRowTable, id: string): string {
  return `${table}:${id}`;
}

function noOpTarget(command: AgentMutationCommand): { table: AgentRowTable; id: string } | null {
  switch (command.kind) {
    case "edit_asset":
      return { table: "assets", id: String(command.assetId) };
    case "edit_maintenance_task":
    case "reschedule_maintenance_task":
      return { table: "maintenance_tasks", id: String(command.taskId) };
    case "edit_maintenance_record":
      return { table: "maintenance_records", id: String(command.recordId) };
    default:
      return null;
  }
}

function isAsset(entity: StagedEntity): entity is Asset {
  return "metadata" in entity;
}

function isTask(entity: StagedEntity): entity is MaintenanceTask {
  return "nextDue" in entity && "intervalValue" in entity;
}

function isRecordEntity(entity: AssetId | StagedEntity): entity is MaintenanceRecord {
  return typeof entity !== "string" && !isAsset(entity) && !isTask(entity);
}

function isAgentGuardFailure(error: unknown): boolean {
  return error instanceof Error && error.message.includes("CHECK constraint failed: assertion = 1");
}
