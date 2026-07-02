-- Notifications: the durable scheduler's own state (never reads maintenance-task
-- tables in steady state). Snapshots ride in from enriched events so every row
-- renders on its own even after the source task/asset changes.

-- Cancelable scheduled-reminder state, keyed by source maintenance task.
CREATE TABLE scheduled_reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  maintenance_task_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  next_due TEXT NOT NULL,           -- date-only YYYY-MM-DD
  fire_at TEXT NOT NULL,            -- date-only: next_due - lead
  status TEXT NOT NULL,            -- pending | fired | canceled | superseded
  last_event_id TEXT NOT NULL,
  last_event_occurred_at TEXT NOT NULL, -- instant, for order resolution
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- At most one pending reminder per task at a time.
CREATE UNIQUE INDEX idx_scheduled_reminders_pending_task
  ON scheduled_reminders (maintenance_task_id) WHERE status = 'pending';

CREATE INDEX idx_scheduled_reminders_task ON scheduled_reminders (maintenance_task_id);
CREATE INDEX idx_scheduled_reminders_sweep ON scheduled_reminders (status, fire_at);

-- Durable in-app inbox. One notification per (task, cycle).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,             -- maintenance_due_soon
  maintenance_task_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  next_due TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

-- Idempotent creation: one notification per task per due-cycle.
CREATE UNIQUE INDEX idx_notifications_task_cycle
  ON notifications (maintenance_task_id, next_due);

-- Newest-first, owner-scoped inbox reads with a stable id tiebreak.
CREATE INDEX idx_notifications_owner
  ON notifications (owner_id, created_at DESC, id DESC);

-- One aggregated reminder email per owner per sweep.
CREATE TABLE email_batches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,           -- pending | sent | suppressed | failed
  suppress_reason TEXT,           -- no_contact_email | unverified | none | NULL
  notification_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_email_batches_owner ON email_batches (owner_id, created_at);

-- Inbound event dedupe / order markers. PK dedupes redelivered events by id.
CREATE TABLE notification_ingested_events (
  event_id TEXT PRIMARY KEY,
  maintenance_task_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

-- Durable dead letters for the two notification queues and their DLQs.
CREATE TABLE notification_dead_letters (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL,
  payload TEXT NOT NULL,           -- raw JSON message body
  error TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX idx_notification_dead_letters_queue
  ON notification_dead_letters (queue, received_at);
