import { DatabaseSync } from "node:sqlite";
import { AssetId, InvariantError, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { MaintenanceTaskUpdated } from "../../../domain/maintenance/events/MaintenanceTaskUpdated.ts";
import { D1AgentOperationRecovery } from "./D1AgentOperationRecovery.ts";
import { handleNotificationEventBatch } from "../../notifications/NotificationEventQueueConsumer.ts";
import { NOTIFICATION_EVENTS_QUEUE_NAME } from "../../notifications/NotificationEventMessage.ts";
import { prepareNotificationOutboxInsert } from "../../notifications/D1NotificationOutboxRepository.ts";
import type { AgentJournalCommit, AgentRowChange, AgentRowSnapshot } from "./AgentJournalTypes.ts";
import { D1AgentOperationJournal } from "./D1AgentOperationJournal.ts";

const SCHEMA = `
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT NOT NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    shared_team_id TEXT,
    revision INTEGER
  );
  CREATE TABLE maintenance_tasks (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    interval_value INTEGER NOT NULL,
    interval_unit TEXT NOT NULL,
    last_completed_date TEXT,
    next_due TEXT NOT NULL,
    created_at TEXT NOT NULL,
    schedule_seed_date TEXT,
    initial_last_completed_date TEXT,
    revision INTEGER NOT NULL,
    next_due_override TEXT
  );
  CREATE TABLE maintenance_records (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    performed_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    task_id TEXT REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
    revision INTEGER NOT NULL
  );
  CREATE TABLE notification_event_outbox (
    id TEXT PRIMARY KEY,
    consumer TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sent_at TEXT,
    delivered_at TEXT
  );
  CREATE TABLE scheduled_reminders (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    maintenance_task_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    task_title TEXT NOT NULL,
    next_due TEXT NOT NULL,
    fire_at TEXT NOT NULL,
    snoozed_until TEXT,
    status TEXT NOT NULL,
    last_event_id TEXT NOT NULL,
    last_event_occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_scheduled_reminders_pending_task
    ON scheduled_reminders (maintenance_task_id) WHERE status = 'pending';
  CREATE TABLE notification_ingested_events (
    event_id TEXT PRIMARY KEY,
    maintenance_task_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    processed_at TEXT NOT NULL
  );
  CREATE TABLE mutation_guards (
    name TEXT PRIMARY KEY,
    assertion INTEGER NOT NULL CHECK (assertion = 1)
  );
  CREATE TABLE agent_operation_journal (
    actor_id TEXT NOT NULL REFERENCES users(id),
    operation_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    receipt_json TEXT NOT NULL,
    snapshot_version INTEGER NOT NULL,
    snapshots_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    restored_at TEXT,
    PRIMARY KEY (actor_id, operation_id)
  );
`;

const ACTOR = "239f68c0-c6a2-4550-8c5b-30e0f66fe7e2";
const OPERATION = "188e5572-a712-4b1d-9f67-a260214ef953";
const LATER_OPERATION = "0889fb42-38dc-415f-b9e7-33a88df0eb9d";
const ASSET_ID = "89cf5a7c-62b7-4a73-a9eb-61a669e30d35";
const TASK_ID = "cb447383-5dc6-49a1-acf0-4f3f95f4e03f";
const RECORD_ID = "7f6846c5-436b-4854-99a4-049db4f34dd1";
const PRIVATE_STREET = "123 Sensitive Street";

describe("D1AgentOperationRecovery (real SQLite transactions)", () => {
  it("defaults to dry run, keeps snapshots private, and restores an asset without decrementing revision", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot({
      name: "Before",
      metadata: JSON.stringify({ street: PRIVATE_STREET }),
      revision: 0,
    });
    const after: AgentRowSnapshot = {
      ...before,
      name: "After",
      revision: 1,
      updated_at: "2026-09-25T12:00:00.000Z",
    };
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "edit_asset",
      [{ table: "assets", id: ASSET_ID, before, after }],
      [
        db
          .prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(
            after.id,
            after.owner_id,
            after.name,
            after.type,
            after.metadata,
            after.archived_at,
            after.created_at,
            after.updated_at,
            after.shared_team_id,
            after.revision,
          ),
      ],
    );

    const inspection = await recovery.inspect(ACTOR, OPERATION);
    expect(inspection).toMatchObject({
      operationId: OPERATION,
      tool: "edit_asset",
      status: "found",
      affectedRows: 1,
    });
    const dryRun = await recovery.recover(ACTOR, OPERATION);

    expect(dryRun.status).toBe("dry_run_ready");
    expect(JSON.stringify(dryRun)).not.toContain(PRIVATE_STREET);
    expect(readAsset(sqlite, ASSET_ID)).toMatchObject({ name: "After", revision: 1 });
    expect(readJournal(sqlite)?.restored_at).toBeNull();

    const restored = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(restored.status).toBe("restored");
    expect(readAsset(sqlite, ASSET_ID)).toMatchObject({ name: "Before", revision: 2 });
    expect(readAsset(sqlite, ASSET_ID)?.metadata).toContain(PRIVATE_STREET);
    expect(readJournal(sqlite)?.restored_at).toEqual(expect.any(String));
    expect(count(sqlite, "notification_event_outbox")).toBe(0);
  });

  it.each([0, null])(
    "restores a no-op journal entry without changing stored asset revision %s",
    async (revision) => {
      const { sqlite, db } = createDatabase();
      seedActor(sqlite);
      const snapshot = assetSnapshot({ revision });
      seedAsset(sqlite, snapshot);
      await journalMutation(
        db,
        "edit_asset",
        [{ table: "assets", id: ASSET_ID, before: snapshot, after: snapshot }],
        [],
      );
      const before = readAsset(sqlite, ASSET_ID);
      const recovery = new D1AgentOperationRecovery(db);

      expect((await recovery.recover(ACTOR, OPERATION)).status).toBe("dry_run_ready");
      expect((await recovery.recover(ACTOR, OPERATION, { apply: true })).status).toBe("restored");
      expect(readAsset(sqlite, ASSET_ID)).toEqual(before);
      expect(readJournal(sqlite)?.restored_at).toEqual(expect.any(String));
      expect(count(sqlite, "notification_event_outbox")).toBe(0);
    },
  );

  it("reverses untouched asset creation but refuses to remove it after maintenance depends on it", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const after = assetSnapshot({ name: "Agent asset", revision: 1 });
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "create_asset",
      [{ table: "assets", id: ASSET_ID, before: null, after }],
      [
        db
          .prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(
            after.id,
            after.owner_id,
            after.name,
            after.type,
            after.metadata,
            after.archived_at,
            after.created_at,
            after.updated_at,
            after.shared_team_id,
            after.revision,
          ),
      ],
    );

    expect((await recovery.recover(ACTOR, OPERATION)).status).toBe("dry_run_ready");
    sqlite
      .prepare("INSERT INTO maintenance_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        TASK_ID,
        ASSET_ID,
        ACTOR,
        "Oil",
        1,
        "year",
        null,
        "2027-09-25",
        "2026-09-25",
        "2026-09-25",
        null,
        0,
        null,
      );

    const blocked = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(blocked.status).toBe("blocked");
    expect(blocked.reasonCodes).toContain("dependent_data_exists");
    expect(readAsset(sqlite, ASSET_ID)?.name).toBe("Agent asset");
    expect(readJournal(sqlite)?.restored_at).toBeNull();
  });

  it("allows create then edit recovery only after the later edit has been restored", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const recovery = new D1AgentOperationRecovery(db);
    const created = assetSnapshot({ name: "Created", revision: 1 });
    await journalMutation(
      db,
      "create_asset",
      [{ table: "assets", id: ASSET_ID, before: null, after: created }],
      [
        db
          .prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...assetValues(created)),
      ],
      OPERATION,
    );
    const edited = {
      ...created,
      name: "Edited",
      revision: 2,
      updated_at: "2026-09-25T12:00:00.000Z",
    };
    await journalMutation(
      db,
      "edit_asset",
      [{ table: "assets", id: ASSET_ID, before: created, after: edited }],
      [
        db
          .prepare("UPDATE assets SET name = ?, revision = ?, updated_at = ? WHERE id = ?")
          .bind(edited.name, edited.revision, edited.updated_at, ASSET_ID),
      ],
      LATER_OPERATION,
    );
    sqlite
      .prepare("UPDATE agent_operation_journal SET created_at = ? WHERE operation_id = ?")
      .run("2026-09-25T10:00:00.000Z", OPERATION);
    sqlite
      .prepare("UPDATE agent_operation_journal SET created_at = ? WHERE operation_id = ?")
      .run("2026-09-25T10:00:00.000Z", LATER_OPERATION);

    const laterRestore = await recovery.recover(ACTOR, LATER_OPERATION, { apply: true });
    expect(laterRestore).toMatchObject({ status: "restored", reasonCodes: [] });
    expect(readAsset(sqlite, ASSET_ID)).toMatchObject({ name: "Created", revision: 3 });

    const createRestore = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(createRestore).toMatchObject({ status: "restored", reasonCodes: [] });
    expect(readAsset(sqlite, ASSET_ID)).toBeUndefined();
  });

  it("reverses task create/edit/reschedule and queues the restored schedule conclusion", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const before = taskSnapshot({ revision: 4, next_due: "2027-01-01", next_due_override: null });
    const after = {
      ...before,
      next_due: "2027-02-01",
      next_due_override: "2027-02-01",
      revision: 5,
    };
    seedTask(sqlite, after);
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "reschedule_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before, after }],
      [
        db
          .prepare(
            "UPDATE maintenance_tasks SET next_due = ?, next_due_override = ?, revision = ? WHERE id = ?",
          )
          .bind(after.next_due, after.next_due_override, after.revision, TASK_ID),
      ],
    );

    const restored = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(restored.status).toBe("restored");
    expect(readTask(sqlite, TASK_ID)).toMatchObject({
      next_due: "2027-01-01",
      next_due_override: null,
      revision: 6,
    });
    expect(notificationEvents(sqlite)).toEqual([
      expect.objectContaining({
        type: "MaintenanceTaskUpdated",
        nextDue: "2027-01-01",
        taskTitle: "Oil",
      }),
    ]);
  });

  it("orders the recovery schedule after durable task events and ignores reverse-delivered stale events", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const before = taskSnapshot({ revision: 4, next_due: "2099-01-01" });
    const after: AgentRowSnapshot = { ...before, revision: 5, next_due: "2099-02-01" };
    seedTask(sqlite, after);
    const sourceOccurredAt = "2099-01-01T00:00:00.000Z";
    const sourceEvent = {
      ...MaintenanceTaskUpdated({
        maintenanceTaskId: MaintenanceTaskId.from(TASK_ID),
        assetId: AssetId.from(ASSET_ID),
        ownerId: UserId.from(ACTOR),
        actorId: UserId.from(ACTOR),
        assetName: "Truck",
        assetType: "vehicle",
        title: String(after.title),
        intervalValue: Number(after.interval_value),
        intervalUnit: "year",
        nextDue: String(after.next_due),
      }),
      occurredAt: new Date(sourceOccurredAt),
    };
    const sourceOutbox = prepareNotificationOutboxInsert(db, sourceEvent);
    if (sourceOutbox === null) throw new Error("Expected a durable task schedule event");
    await journalMutation(
      db,
      "reschedule_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before, after }],
      [
        db
          .prepare("UPDATE maintenance_tasks SET next_due = ?, revision = ? WHERE id = ?")
          .bind(after.next_due, after.revision, TASK_ID),
        sourceOutbox,
      ],
    );
    sqlite
      .prepare(
        "UPDATE agent_operation_journal SET created_at = ? WHERE actor_id = ? AND operation_id = ?",
      )
      .run(sourceOccurredAt, ACTOR, OPERATION);

    const restored = await new D1AgentOperationRecovery(db).recover(ACTOR, OPERATION, {
      apply: true,
    });

    expect(restored.status).toBe("restored");
    expect(restored.restoredAt).toBeDefined();
    if (restored.restoredAt === null) throw new Error("Expected a monotonic recovery timestamp");
    expect(Date.parse(restored.restoredAt)).toBeGreaterThan(Date.parse(sourceOccurredAt));
    const events = notificationEvents(sqlite);
    const staleMutation = events.find((event) => event.nextDue === after.next_due);
    const recoveryConclusion = events.find((event) => event.nextDue === before.next_due);
    expect(staleMutation?.occurredAt).toBe(sourceOccurredAt);
    expect(recoveryConclusion?.occurredAt).toBe(restored.restoredAt);

    const deliveredBodies = [recoveryConclusion, staleMutation];
    if (deliveredBodies[0] === undefined || deliveredBodies[1] === undefined) {
      throw new Error("Expected both task schedule events");
    }
    await handleNotificationEventBatch(
      {
        queue: NOTIFICATION_EVENTS_QUEUE_NAME,
        messages: deliveredBodies.map((body, index) => ({
          id: `recovery-drill-${index}`,
          body,
          attempts: 1,
          ack: () => undefined,
          retry: () => undefined,
        })),
      } as unknown as MessageBatch<unknown>,
      db,
    );

    const reminder = sqlite
      .prepare(
        "SELECT next_due, last_event_occurred_at, status FROM scheduled_reminders WHERE maintenance_task_id = ?",
      )
      .get(TASK_ID);
    expect(reminder).toMatchObject({
      next_due: before.next_due,
      last_event_occurred_at: restored.restoredAt,
      status: "pending",
    });
  });

  it("refuses to reverse task creation while a maintenance record depends on it", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const after = taskSnapshot({ revision: 0 });
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "create_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before: null, after }],
      [
        db
          .prepare("INSERT INTO maintenance_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...taskValues(after)),
      ],
    );
    sqlite
      .prepare("INSERT INTO maintenance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        RECORD_ID,
        ASSET_ID,
        ACTOR,
        "Repair",
        "2026-09-25",
        null,
        "2026-09-25T12:00:00.000Z",
        TASK_ID,
        0,
      );

    const report = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(report.status).toBe("blocked");
    expect(report.reasonCodes).toContain("dependent_data_exists");
    expect(readTask(sqlite, TASK_ID)?.id).toBe(TASK_ID);
    expect(readJournal(sqlite)?.restored_at).toBeNull();
    expect(count(sqlite, "notification_event_outbox")).toBe(0);
  });

  it("removes a created task and queues a deletion conclusion after explicit apply", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const after = taskSnapshot({ revision: 0 });
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "create_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before: null, after }],
      [
        db
          .prepare("INSERT INTO maintenance_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...taskValues(after)),
      ],
    );

    expect((await recovery.recover(ACTOR, OPERATION)).status).toBe("dry_run_ready");
    expect(readTask(sqlite, TASK_ID)?.id).toBe(TASK_ID);
    const applied = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(applied.status).toBe("restored");
    expect(readTask(sqlite, TASK_ID)).toBeUndefined();
    expect(notificationEvents(sqlite)).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskDeleted", taskTitle: "Oil" }),
    ]);
  });

  it("restores linked record creation together with its task and does not reuse historical activity", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const taskBefore = taskSnapshot({
      revision: 7,
      last_completed_date: null,
      next_due: "2027-01-01",
    });
    const taskAfter = {
      ...taskBefore,
      last_completed_date: "2026-09-25",
      next_due: "2027-09-25",
      revision: 8,
    };
    seedTask(sqlite, taskAfter);
    const recordAfter = recordSnapshot({ revision: 0, task_id: TASK_ID });
    const changes: AgentRowChange[] = [
      { table: "maintenance_tasks", id: TASK_ID, before: taskBefore, after: taskAfter },
      { table: "maintenance_records", id: RECORD_ID, before: null, after: recordAfter },
    ];
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(db, "record_maintenance", changes, [
      db
        .prepare(
          "UPDATE maintenance_tasks SET last_completed_date = ?, next_due = ?, revision = ? WHERE id = ?",
        )
        .bind(taskAfter.last_completed_date, taskAfter.next_due, taskAfter.revision, TASK_ID),
      db
        .prepare("INSERT INTO maintenance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          recordAfter.id,
          recordAfter.asset_id,
          recordAfter.owner_id,
          recordAfter.title,
          recordAfter.performed_at,
          recordAfter.notes,
          recordAfter.created_at,
          recordAfter.task_id,
          recordAfter.revision,
        ),
    ]);

    const report = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(report.status).toBe("restored");
    expect(count(sqlite, "maintenance_records")).toBe(0);
    expect(readTask(sqlite, TASK_ID)).toMatchObject({
      last_completed_date: null,
      next_due: "2027-01-01",
      revision: 9,
    });
    expect(notificationEvents(sqlite)).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskUpdated", nextDue: "2027-01-01" }),
    ]);
  });

  it("allows created task recovery after a later linked record operation is restored", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const recovery = new D1AgentOperationRecovery(db);
    const createdTask = taskSnapshot({ revision: 0 });
    await journalMutation(
      db,
      "create_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before: null, after: createdTask }],
      [
        db
          .prepare("INSERT INTO maintenance_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...taskValues(createdTask)),
      ],
      OPERATION,
    );

    const completedTask = {
      ...createdTask,
      last_completed_date: "2026-09-25",
      next_due: "2027-09-25",
      revision: 1,
    };
    const completedRecord = recordSnapshot({ task_id: TASK_ID });
    await journalMutation(
      db,
      "record_maintenance",
      [
        { table: "maintenance_tasks", id: TASK_ID, before: createdTask, after: completedTask },
        { table: "maintenance_records", id: RECORD_ID, before: null, after: completedRecord },
      ],
      [
        db
          .prepare(
            "UPDATE maintenance_tasks SET last_completed_date = ?, next_due = ?, revision = ? WHERE id = ?",
          )
          .bind(
            completedTask.last_completed_date,
            completedTask.next_due,
            completedTask.revision,
            TASK_ID,
          ),
        db
          .prepare("INSERT INTO maintenance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...recordValues(completedRecord)),
      ],
      LATER_OPERATION,
    );
    sqlite
      .prepare("UPDATE agent_operation_journal SET created_at = ? WHERE operation_id = ?")
      .run("2026-09-25T10:00:00.000Z", OPERATION);
    sqlite
      .prepare("UPDATE agent_operation_journal SET created_at = ? WHERE operation_id = ?")
      .run("2026-09-25T11:00:00.000Z", LATER_OPERATION);

    const recordRestore = await recovery.recover(ACTOR, LATER_OPERATION, { apply: true });
    expect(recordRestore.status).toBe("restored");
    expect(readTask(sqlite, TASK_ID)).toMatchObject({
      next_due: createdTask.next_due,
      revision: 2,
    });
    expect(count(sqlite, "maintenance_records")).toBe(0);

    const taskRestore = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(taskRestore.status).toBe("restored");
    expect(readTask(sqlite, TASK_ID)).toBeUndefined();
    expect(notificationEvents(sqlite)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "MaintenanceTaskUpdated", nextDue: createdTask.next_due }),
        expect.objectContaining({ type: "MaintenanceTaskDeleted", taskTitle: createdTask.title }),
      ]),
    );
  });

  it("restores a corrected linked record and its original effective schedule and override", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const taskBefore = taskSnapshot({
      revision: 11,
      last_completed_date: "2026-06-01",
      next_due: "2027-06-01",
      next_due_override: "2027-08-01",
    });
    const taskAfter = {
      ...taskBefore,
      revision: 12,
      last_completed_date: "2026-09-01",
      next_due: "2027-09-01",
      next_due_override: null,
    };
    seedTask(sqlite, taskAfter);
    const recordBefore = recordSnapshot({
      revision: 3,
      performed_at: "2026-06-01",
      notes: "Original note",
      task_id: TASK_ID,
    });
    const recordAfter = {
      ...recordBefore,
      revision: 4,
      performed_at: "2026-09-01",
      notes: "Corrected note",
    };
    sqlite
      .prepare("INSERT INTO maintenance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(...recordValues(recordAfter));
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "edit_maintenance_record",
      [
        { table: "maintenance_records", id: RECORD_ID, before: recordBefore, after: recordAfter },
        { table: "maintenance_tasks", id: TASK_ID, before: taskBefore, after: taskAfter },
      ],
      [],
    );

    const applied = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(applied.status).toBe("restored");
    expect(readRecord(sqlite, RECORD_ID)).toMatchObject({
      performed_at: "2026-06-01",
      notes: "Original note",
      revision: 5,
    });
    expect(readTask(sqlite, TASK_ID)).toMatchObject({
      last_completed_date: "2026-06-01",
      next_due: "2027-06-01",
      next_due_override: "2027-08-01",
      revision: 13,
    });
    expect(notificationEvents(sqlite)).toEqual([
      expect.objectContaining({ type: "MaintenanceTaskUpdated", nextDue: "2027-06-01" }),
    ]);
  });

  it("blocks an existing task restore if a different later record now depends on it", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const before = taskSnapshot({ revision: 2, next_due: "2027-01-01" });
    const after = { ...before, revision: 3, next_due: "2027-02-01" };
    seedTask(sqlite, after);
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "reschedule_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before, after }],
      [],
    );
    // Keep the operation earlier than the fixed later-record fixture, independent of wall time.
    sqlite
      .prepare(
        "UPDATE agent_operation_journal SET created_at = ? WHERE actor_id = ? AND operation_id = ?",
      )
      .run("2026-09-25T10:00:00.000Z", ACTOR, OPERATION);
    sqlite
      .prepare("INSERT INTO maintenance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "6fb67f3c-41b5-469d-bd0e-d072c71c974a",
        ASSET_ID,
        ACTOR,
        "Later work",
        "2026-09-26",
        null,
        "2026-09-26T10:00:00.000Z",
        TASK_ID,
        0,
      );

    const report = await recovery.recover(ACTOR, OPERATION);

    expect(report.status).toBe("blocked");
    expect(report.reasonCodes).toContain("dependent_data_exists");
    expect(readTask(sqlite, TASK_ID)).toMatchObject({ next_due: "2027-02-01", revision: 3 });
  });

  it("blocks changed current rows and a race after dry-run without marking the journal restored", async () => {
    const { sqlite, db, setBeforeBatch } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const before = taskSnapshot({ revision: 1, next_due: "2027-01-01" });
    const after = { ...before, revision: 2, next_due: "2027-02-01" };
    seedTask(sqlite, after);
    const recovery = new D1AgentOperationRecovery(db);
    await journalMutation(
      db,
      "edit_maintenance_task",
      [{ table: "maintenance_tasks", id: TASK_ID, before, after }],
      [],
    );

    const dryRun = await recovery.recover(ACTOR, OPERATION);
    expect(dryRun.status).toBe("dry_run_ready");
    sqlite
      .prepare("UPDATE maintenance_tasks SET next_due = ?, revision = ? WHERE id = ?")
      .run("2027-03-01", 3, TASK_ID);
    const changed = await recovery.recover(ACTOR, OPERATION, { apply: true });
    expect(changed.status).toBe("blocked");
    expect(changed.reasonCodes).toContain("current_state_changed");
    expect(readTask(sqlite, TASK_ID)).toMatchObject({ next_due: "2027-03-01", revision: 3 });

    sqlite
      .prepare("UPDATE maintenance_tasks SET next_due = ?, revision = ? WHERE id = ?")
      .run(after.next_due, after.revision, TASK_ID);
    setBeforeBatch(() => {
      sqlite
        .prepare("UPDATE maintenance_tasks SET next_due = ?, revision = ? WHERE id = ?")
        .run("2027-04-01", 4, TASK_ID);
    });
    const raced = await recovery.recover(ACTOR, OPERATION, { apply: true });

    expect(raced.status).toBe("blocked");
    expect(raced.reasonCodes).toContain("transaction_guard_failed");
    expect(readTask(sqlite, TASK_ID)).toMatchObject({ next_due: "2027-04-01", revision: 4 });
    expect(readJournal(sqlite)?.restored_at).toBeNull();
    expect(count(sqlite, "notification_event_outbox")).toBe(0);
  });

  it("blocks structurally complete evidence whose safe receipt contradicts its snapshot", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    const before = assetSnapshot({ revision: 0 });
    const after = { ...before, name: "After", revision: 1 };
    seedAsset(sqlite, before);
    await journalMutation(
      db,
      "edit_asset",
      [{ table: "assets", id: ASSET_ID, before, after }],
      [
        db
          .prepare("UPDATE assets SET name = ?, revision = ? WHERE id = ?")
          .bind("After", 1, ASSET_ID),
      ],
    );
    sqlite
      .prepare(
        "UPDATE agent_operation_journal SET receipt_json = ? WHERE actor_id = ? AND operation_id = ?",
      )
      .run(
        JSON.stringify({
          operationId: OPERATION,
          entityType: "asset",
          entityId: ASSET_ID,
          assetId: ASSET_ID,
          appliedRevision: 99,
        }),
        ACTOR,
        OPERATION,
      );

    const report = await new D1AgentOperationRecovery(db).recover(ACTOR, OPERATION);

    expect(report.status).toBe("blocked");
    expect(report.reasonCodes).toContain("unsupported_snapshot");
    expect(readAsset(sqlite, ASSET_ID)).toMatchObject({ name: "After", revision: 1 });
    expect(readJournal(sqlite)?.restored_at).toBeNull();
  });

  it.each(["incomplete evidence", "unknown version"])(
    "refuses malformed stored snapshots with %s without changing state or exposing contents",
    async (corruption) => {
      const { sqlite, db } = createDatabase();
      seedActor(sqlite);
      const before = assetSnapshot({
        metadata: JSON.stringify({ street: PRIVATE_STREET }),
        revision: 0,
      });
      const after = { ...before, name: "After", revision: 1 };
      seedAsset(sqlite);
      await journalMutation(
        db,
        "edit_asset",
        [{ table: "assets", id: ASSET_ID, before, after }],
        [
          db
            .prepare("UPDATE assets SET name = ?, revision = ? WHERE id = ?")
            .bind("After", 1, ASSET_ID),
        ],
      );
      if (corruption === "incomplete evidence") {
        sqlite
          .prepare(
            "UPDATE agent_operation_journal SET snapshots_json = ? WHERE actor_id = ? AND operation_id = ?",
          )
          .run(
            JSON.stringify({
              version: 1,
              changes: [{ table: "assets", id: ASSET_ID, before: { id: ASSET_ID }, after }],
            }),
            ACTOR,
            OPERATION,
          );
      } else {
        sqlite
          .prepare(
            "UPDATE agent_operation_journal SET snapshot_version = ?, snapshots_json = ? WHERE actor_id = ? AND operation_id = ?",
          )
          .run(
            7,
            JSON.stringify({
              version: 7,
              changes: [{ table: "assets", id: ASSET_ID, before, after }],
            }),
            ACTOR,
            OPERATION,
          );
      }
      const recovery = new D1AgentOperationRecovery(db);

      const failure = await recovery
        .recover(ACTOR, OPERATION, { apply: true })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(InvariantError);
      if (failure instanceof Error) expect(failure.message).not.toContain(PRIVATE_STREET);
      expect(readAsset(sqlite, ASSET_ID)).toMatchObject({ name: "After", revision: 1 });
      expect(readJournal(sqlite)?.restored_at).toBeNull();
      expect(count(sqlite, "notification_event_outbox")).toBe(0);
      expect(count(sqlite, "maintenance_records")).toBe(0);
    },
  );

  it("reports an already restored operation and missing operation without reading another actor's entry", async () => {
    const { sqlite, db } = createDatabase();
    seedActor(sqlite);
    seedAsset(sqlite);
    const snapshot = assetSnapshot({ revision: 0 });
    await journalMutation(
      db,
      "edit_asset",
      [{ table: "assets", id: ASSET_ID, before: snapshot, after: snapshot }],
      [],
    );
    sqlite
      .prepare(
        "UPDATE agent_operation_journal SET restored_at = ? WHERE actor_id = ? AND operation_id = ?",
      )
      .run("2026-09-25T12:00:00.000Z", ACTOR, OPERATION);
    const recovery = new D1AgentOperationRecovery(db);

    expect((await recovery.recover(ACTOR, OPERATION)).status).toBe("already_restored");
    expect((await recovery.inspect("00000000-0000-4000-8000-000000000000", OPERATION)).status).toBe(
      "not_found",
    );
  });
});

function createDatabase(): {
  sqlite: DatabaseSync;
  db: SqliteD1Database;
  setBeforeBatch: (hook: (() => void) | null) => void;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(SCHEMA);
  let beforeBatch: (() => void) | null = null;
  return {
    sqlite,
    db: new SqliteD1Database(sqlite, () => {
      const hook = beforeBatch;
      beforeBatch = null;
      hook?.();
    }),
    setBeforeBatch: (hook) => {
      beforeBatch = hook;
    },
  };
}

function seedActor(sqlite: DatabaseSync): void {
  sqlite.prepare("INSERT INTO users (id) VALUES (?)").run(ACTOR);
}

function seedAsset(sqlite: DatabaseSync, asset: AgentRowSnapshot = assetSnapshot()): void {
  sqlite
    .prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(...assetValues(asset));
}

function assetValues(asset: AgentRowSnapshot): (string | number | null)[] {
  return [
    taskValue(asset, "id"),
    taskValue(asset, "owner_id"),
    taskValue(asset, "name"),
    taskValue(asset, "type"),
    taskValue(asset, "metadata"),
    taskValue(asset, "archived_at"),
    taskValue(asset, "created_at"),
    taskValue(asset, "updated_at"),
    taskValue(asset, "shared_team_id"),
    taskValue(asset, "revision"),
  ];
}

function seedTask(sqlite: DatabaseSync, task: AgentRowSnapshot): void {
  sqlite
    .prepare("INSERT INTO maintenance_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(...taskValues(task));
}

function taskValues(task: AgentRowSnapshot): (string | number | null)[] {
  return [
    taskValue(task, "id"),
    taskValue(task, "asset_id"),
    taskValue(task, "owner_id"),
    taskValue(task, "title"),
    taskValue(task, "interval_value"),
    taskValue(task, "interval_unit"),
    taskValue(task, "last_completed_date"),
    taskValue(task, "next_due"),
    taskValue(task, "created_at"),
    taskValue(task, "schedule_seed_date"),
    taskValue(task, "initial_last_completed_date"),
    taskValue(task, "revision"),
    taskValue(task, "next_due_override"),
  ];
}

function recordValues(record: AgentRowSnapshot): (string | number | null)[] {
  return [
    taskValue(record, "id"),
    taskValue(record, "asset_id"),
    taskValue(record, "owner_id"),
    taskValue(record, "title"),
    taskValue(record, "performed_at"),
    taskValue(record, "notes"),
    taskValue(record, "created_at"),
    taskValue(record, "task_id"),
    taskValue(record, "revision"),
  ];
}

function taskValue(snapshot: AgentRowSnapshot, column: string): string | number | null {
  const value = snapshot[column];
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error("Expected a SQLite test snapshot value");
}

function assetSnapshot(overrides: Partial<AgentRowSnapshot> = {}): AgentRowSnapshot {
  return {
    id: ASSET_ID,
    owner_id: ACTOR,
    name: "Truck",
    type: "vehicle",
    metadata: "{}",
    archived_at: null,
    created_at: "2026-09-25T10:00:00.000Z",
    updated_at: "2026-09-25T10:00:00.000Z",
    shared_team_id: null,
    revision: 0,
    ...overrides,
  };
}

function taskSnapshot(overrides: Partial<AgentRowSnapshot> = {}): AgentRowSnapshot {
  return {
    id: TASK_ID,
    asset_id: ASSET_ID,
    owner_id: ACTOR,
    title: "Oil",
    interval_value: 1,
    interval_unit: "year",
    last_completed_date: "2026-01-01",
    next_due: "2027-01-01",
    created_at: "2026-01-01T10:00:00.000Z",
    schedule_seed_date: "2026-01-01",
    initial_last_completed_date: "2026-01-01",
    revision: 0,
    next_due_override: null,
    ...overrides,
  };
}

function recordSnapshot(overrides: Partial<AgentRowSnapshot> = {}): AgentRowSnapshot {
  return {
    id: RECORD_ID,
    asset_id: ASSET_ID,
    owner_id: ACTOR,
    title: "Oil change",
    performed_at: "2026-09-25",
    notes: null,
    created_at: "2026-09-25T10:00:00.000Z",
    task_id: null,
    revision: 0,
    ...overrides,
  };
}

async function journalMutation(
  db: D1Database,
  tool: AgentJournalCommit["tool"],
  changes: AgentRowChange[],
  statements: D1PreparedStatement[],
  operationId: string = OPERATION,
): Promise<void> {
  const isRecordOperation = tool === "record_maintenance" || tool === "edit_maintenance_record";
  const entityChange = isRecordOperation
    ? changes.find((change) => change.table === "maintenance_records")
    : (changes.find((change) => change.table !== "assets") ??
      changes.find((change) => change.table === "assets"));
  const entityType = entityChange?.table ?? "assets";
  const entityId = entityChange?.id ?? ASSET_ID;
  const linkedTaskChange = isRecordOperation
    ? changes.find((change) => change.table === "maintenance_tasks")
    : undefined;
  const journal = new D1AgentOperationJournal(db);
  await journal.commit({
    actorId: UserId.from(ACTOR),
    operationId,
    tool,
    input: { operationId },
    receipt: {
      operationId,
      entityType:
        entityType === "assets" ? "asset" : entityType === "maintenance_tasks" ? "task" : "record",
      entityId,
      assetId: ASSET_ID,
      appliedRevision:
        typeof entityChange?.after?.revision === "number" ? entityChange.after.revision : 0,
      ...(linkedTaskChange?.after === null || linkedTaskChange === undefined
        ? {}
        : {
            linkedTask: {
              taskId: linkedTaskChange.id,
              appliedRevision: Number(linkedTaskChange.after.revision),
              nextDue: String(linkedTaskChange.after.next_due),
            },
          }),
    },
    changes,
    statements,
  });
}

function readAsset(sqlite: DatabaseSync, id: string): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM assets WHERE id = ?").get(id);
}

function readTask(sqlite: DatabaseSync, id: string): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM maintenance_tasks WHERE id = ?").get(id);
}

function readRecord(sqlite: DatabaseSync, id: string): Record<string, unknown> | undefined {
  return sqlite.prepare("SELECT * FROM maintenance_records WHERE id = ?").get(id);
}

function readJournal(sqlite: DatabaseSync): Record<string, unknown> | undefined {
  return sqlite
    .prepare(
      "SELECT restored_at FROM agent_operation_journal WHERE actor_id = ? AND operation_id = ?",
    )
    .get(ACTOR, OPERATION);
}

function count(
  sqlite: DatabaseSync,
  table: "maintenance_records" | "notification_event_outbox",
): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (row === undefined || typeof row.count !== "number")
    throw new Error("Expected a SQLite row count");
  return row.count;
}

function notificationEvents(sqlite: DatabaseSync): Record<string, unknown>[] {
  return sqlite
    .prepare("SELECT event_type, payload FROM notification_event_outbox ORDER BY id")
    .all()
    .map((row) => {
      if (typeof row.payload !== "string") throw new Error("Expected a notification event payload");
      return JSON.parse(row.payload) as Record<string, unknown>;
    });
}

class SqliteD1Database {
  #batchTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly beforeBatch: () => void,
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const execute = this.#batchTail.then(async () => {
      this.beforeBatch();
      this.sqlite.exec("BEGIN");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await statement.run<T>());
        this.sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        this.sqlite.exec("ROLLBACK");
        throw error;
      }
    });
    this.#batchTail = execute.then(
      () => undefined,
      () => undefined,
    );
    return execute;
  }

  exec(): Promise<D1ExecResult> {
    return Promise.reject(new Error("exec is not used in the test adapter"));
  }

  withSession(): D1DatabaseSession {
    throw new Error("withSession is not used in the test adapter");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(new Error("dump is not used in the test adapter"));
  }
}

class SqliteD1PreparedStatement {
  #values: unknown[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.#values = values;
    return this;
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.#prepared().get(...sqlValues(this.#values));
    if (row === undefined) return Promise.resolve(null);
    if (columnName !== undefined) {
      const value = row[columnName];
      return Promise.resolve(value === undefined || value === null ? null : asD1Row<T>(value));
    }
    return Promise.resolve(asD1Row<T>(row));
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.#prepared()
      .all(...sqlValues(this.#values))
      .map((row) => asD1Row<T>(row));
    return Promise.resolve({ success: true, meta: emptyMeta(), results });
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    if (options?.columnNames === true)
      throw new Error("columnNames is not used in this test adapter");
    return Promise.resolve(
      this.#prepared()
        .all(...sqlValues(this.#values))
        .map((row) => Object.values(row) as T),
    );
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    if (/^\s*(select|with|pragma)\b/i.test(this.query)) return this.all<T>();
    const result = this.#prepared().run(...sqlValues(this.#values));
    return {
      success: true,
      meta: {
        ...emptyMeta(),
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
    };
  }

  #prepared(): ReturnType<DatabaseSync["prepare"]> {
    return this.sqlite.prepare(this.query);
  }
}

function emptyMeta(): D1Meta & Record<string, unknown> {
  return {
    changes: 0,
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
  };
}

function sqlValues(values: unknown[]): (string | number | bigint | Uint8Array | null)[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    )
      return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error("Unsupported SQLite test parameter");
  });
}

/** Implements D1's generic row contract at the Node SQLite test boundary. */
function asD1Row<T>(value: unknown): T {
  return value as T;
}
