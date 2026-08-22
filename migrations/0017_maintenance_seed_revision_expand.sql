-- Expand maintenance_tasks and maintenance_records with schedule seed and revision fields.
-- Expand maintenance_write_gate for zero-downtime migration rollouts.

ALTER TABLE maintenance_tasks ADD COLUMN schedule_seed_date TEXT;
ALTER TABLE maintenance_tasks ADD COLUMN initial_last_completed_date TEXT;
ALTER TABLE maintenance_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE maintenance_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS maintenance_write_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('open', 'frozen')) DEFAULT 'open'
);

INSERT OR IGNORE INTO maintenance_write_gate (id, mode) VALUES (1, 'open');

CREATE TABLE IF NOT EXISTS mutation_guards (
  name TEXT PRIMARY KEY,
  assertion INTEGER NOT NULL CHECK (assertion = 1)
);
