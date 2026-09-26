-- Private recovery evidence for authenticated agent operations. Snapshots can
-- contain property street details and are intentionally kept out of activity
-- history, API responses, telemetry, and MCP receipts.
CREATE TABLE agent_operation_journal (
  actor_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id     TEXT NOT NULL,
  tool             TEXT NOT NULL CHECK (tool IN (
    'create_asset',
    'edit_asset',
    'create_maintenance_task',
    'edit_maintenance_task',
    'reschedule_maintenance_task',
    'record_maintenance',
    'edit_maintenance_record'
  )),
  input_hash       TEXT NOT NULL CHECK (length(input_hash) = 64),
  receipt_json     TEXT NOT NULL CHECK (json_valid(receipt_json)),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version = 1),
  snapshots_json   TEXT NOT NULL CHECK (json_valid(snapshots_json)),
  created_at       TEXT NOT NULL,
  restored_at      TEXT,
  PRIMARY KEY (actor_id, operation_id)
);

CREATE INDEX idx_agent_operation_journal_actor_created
  ON agent_operation_journal(actor_id, created_at DESC, operation_id DESC);
