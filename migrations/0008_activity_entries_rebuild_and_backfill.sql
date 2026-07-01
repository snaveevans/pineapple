CREATE TABLE activity_entries_rebuild (
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

INSERT INTO activity_entries_rebuild (
  id,
  source_event_id,
  owner_id,
  actor_id,
  type,
  occurred_at,
  asset_id,
  asset_name,
  asset_type,
  title,
  performed_at,
  created_at
)
SELECT
  id,
  source_event_id,
  owner_id,
  actor_id,
  type,
  occurred_at,
  asset_id,
  asset_name,
  asset_type,
  title,
  performed_at,
  created_at
FROM activity_entries;

DROP TABLE activity_entries;

ALTER TABLE activity_entries_rebuild RENAME TO activity_entries;

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_order
  ON activity_entries(owner_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_type_order
  ON activity_entries(owner_id, type, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_owner_asset_order
  ON activity_entries(owner_id, asset_id, occurred_at DESC, id DESC);

INSERT OR IGNORE INTO activity_entries (
  id,
  source_event_id,
  owner_id,
  actor_id,
  type,
  occurred_at,
  asset_id,
  asset_name,
  asset_type,
  title,
  performed_at,
  created_at
)
SELECT
  id,
  id,
  json_extract(payload, '$.ownerId'),
  json_extract(payload, '$.actorId'),
  json_extract(payload, '$.activityEntryType'),
  json_extract(payload, '$.occurredAt'),
  json_extract(payload, '$.assetId'),
  json_extract(payload, '$.assetName'),
  json_extract(payload, '$.assetType'),
  json_extract(payload, '$.title'),
  json_extract(payload, '$.performedAt'),
  COALESCE(delivered_at, sent_at, updated_at, created_at)
FROM activity_event_outbox
WHERE consumer = 'activity_history'
  AND json_valid(payload)
  AND json_extract(payload, '$.activityEntryType') IN (
    'asset_added',
    'maintenance_logged',
    'task_completed',
    'task_scheduled',
    'task_deleted'
  );
