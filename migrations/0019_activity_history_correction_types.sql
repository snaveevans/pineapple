-- Widen activity_entries.type to include maintenance_record_updated and maintenance_record_deleted
-- and add nullable audit_snapshot_json for full correction audit history (issue #181).

CREATE TABLE activity_entries_new (
  id                  TEXT NOT NULL PRIMARY KEY,
  source_event_id     TEXT NOT NULL UNIQUE,
  owner_id            TEXT NOT NULL REFERENCES users(id),
  actor_id            TEXT NOT NULL REFERENCES users(id),
  type                TEXT NOT NULL CHECK (
    type IN (
      'asset_added',
      'maintenance_logged',
      'maintenance_record_updated',
      'maintenance_record_deleted',
      'task_completed',
      'task_scheduled',
      'task_updated',
      'task_deleted'
    )
  ),
  occurred_at         TEXT NOT NULL,
  asset_id            TEXT NOT NULL,
  asset_name          TEXT NOT NULL,
  asset_type          TEXT NOT NULL CHECK (asset_type IN ('vehicle', 'property', 'equipment')),
  title               TEXT,
  performed_at        TEXT,
  created_at          TEXT NOT NULL,
  actor_display_name  TEXT,
  audit_snapshot_json TEXT
);

INSERT INTO activity_entries_new (
  id, source_event_id, owner_id, actor_id, type, occurred_at, asset_id,
  asset_name, asset_type, title, performed_at, created_at, actor_display_name
)
SELECT
  id, source_event_id, owner_id, actor_id, type, occurred_at, asset_id,
  asset_name, asset_type, title, performed_at, created_at, actor_display_name
FROM activity_entries;

DROP TABLE activity_entries;
ALTER TABLE activity_entries_new RENAME TO activity_entries;

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_order
  ON activity_entries(owner_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_type_order
  ON activity_entries(owner_id, type, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_asset_order
  ON activity_entries(owner_id, asset_id, occurred_at DESC, id DESC);
