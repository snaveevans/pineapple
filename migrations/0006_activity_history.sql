CREATE TABLE IF NOT EXISTS activity_event_outbox (
  id           TEXT NOT NULL PRIMARY KEY,
  consumer     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  sent_at      TEXT,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_event_outbox_claimable
  ON activity_event_outbox(consumer, status, updated_at, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS activity_entries (
  id                TEXT NOT NULL PRIMARY KEY,
  source_event_id   TEXT NOT NULL UNIQUE,
  owner_id          TEXT NOT NULL REFERENCES users(id),
  actor_id          TEXT NOT NULL REFERENCES users(id),
  type              TEXT NOT NULL CHECK (
    type IN (
      'asset_added',
      'maintenance_logged',
      'task_completed',
      'task_scheduled',
      'task_deleted'
    )
  ),
  occurred_at       TEXT NOT NULL,
  asset_id          TEXT NOT NULL,
  asset_name        TEXT NOT NULL,
  asset_type        TEXT NOT NULL CHECK (asset_type IN ('vehicle', 'property', 'equipment')),
  title             TEXT,
  performed_at      TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_order
  ON activity_entries(owner_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_type_order
  ON activity_entries(owner_id, type, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_asset_order
  ON activity_entries(owner_id, asset_id, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dead_letters (
  id               TEXT NOT NULL PRIMARY KEY,
  consumer         TEXT NOT NULL,
  queue            TEXT NOT NULL,
  queue_message_id TEXT NOT NULL UNIQUE,
  source_event_id  TEXT,
  event_type       TEXT,
  payload          TEXT NOT NULL,
  reason           TEXT NOT NULL,
  attempts         INTEGER NOT NULL CHECK (attempts >= 0),
  failed_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_consumer_failed
  ON dead_letters(consumer, failed_at DESC);
