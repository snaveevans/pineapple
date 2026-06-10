CREATE TABLE IF NOT EXISTS maintenance_records (
  id           TEXT NOT NULL PRIMARY KEY,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  owner_id     TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  performed_at TEXT NOT NULL CHECK (
    length(performed_at) = 10
    AND performed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND CAST(substr(performed_at, 1, 4) AS INTEGER) BETWEEN 1 AND 9999
    AND CAST(substr(performed_at, 6, 2) AS INTEGER) BETWEEN 1 AND 12
    AND CAST(substr(performed_at, 9, 2) AS INTEGER) BETWEEN 1 AND CASE
      WHEN CAST(substr(performed_at, 6, 2) AS INTEGER) IN (1, 3, 5, 7, 8, 10, 12)
        THEN 31
      WHEN CAST(substr(performed_at, 6, 2) AS INTEGER) IN (4, 6, 9, 11)
        THEN 30
      WHEN CAST(substr(performed_at, 6, 2) AS INTEGER) = 2
        AND (
          CAST(substr(performed_at, 1, 4) AS INTEGER) % 400 = 0
          OR (
            CAST(substr(performed_at, 1, 4) AS INTEGER) % 4 = 0
            AND CAST(substr(performed_at, 1, 4) AS INTEGER) % 100 != 0
          )
        )
        THEN 29
      WHEN CAST(substr(performed_at, 6, 2) AS INTEGER) = 2
        THEN 28
      ELSE 0
    END
  ),
  notes        TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_owner_asset_history
  ON maintenance_records(owner_id, asset_id, performed_at DESC, created_at DESC);
