CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id                   TEXT NOT NULL PRIMARY KEY,
  asset_id             TEXT NOT NULL REFERENCES assets(id),
  owner_id             TEXT NOT NULL REFERENCES users(id),
  title                TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  interval_value       INTEGER NOT NULL CHECK (interval_value >= 1),
  interval_unit        TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month', 'year')),
  last_completed_date  TEXT CHECK (
    last_completed_date IS NULL
    OR (
      length(last_completed_date) = 10
      AND last_completed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    )
  ),
  next_due             TEXT NOT NULL CHECK (
    length(next_due) = 10
    AND next_due GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_owner_asset_due
  ON maintenance_tasks(owner_id, asset_id, next_due ASC);

ALTER TABLE maintenance_records ADD COLUMN task_id TEXT REFERENCES maintenance_tasks(id) ON DELETE SET NULL;
