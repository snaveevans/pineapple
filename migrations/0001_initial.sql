CREATE TABLE IF NOT EXISTS users (
  id         TEXT NOT NULL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT NOT NULL PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  metadata    TEXT NOT NULL,   -- JSON string
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_owner_id ON assets(owner_id);
