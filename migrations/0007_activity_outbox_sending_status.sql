CREATE TABLE activity_event_outbox_rebuild (
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

INSERT INTO activity_event_outbox_rebuild (
  id,
  consumer,
  event_type,
  payload,
  status,
  attempts,
  last_error,
  created_at,
  updated_at,
  sent_at,
  delivered_at
)
SELECT
  id,
  consumer,
  event_type,
  payload,
  status,
  attempts,
  last_error,
  created_at,
  updated_at,
  sent_at,
  delivered_at
FROM activity_event_outbox;

DROP TABLE activity_event_outbox;

ALTER TABLE activity_event_outbox_rebuild RENAME TO activity_event_outbox;

CREATE INDEX IF NOT EXISTS idx_activity_event_outbox_claimable
  ON activity_event_outbox(consumer, status, updated_at, created_at ASC, id ASC);
