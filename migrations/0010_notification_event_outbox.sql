-- Producer-side transactional outbox for the notification-events queue. Written
-- in the same D1 batch as the maintenance-task change, then relayed to the queue,
-- so a MaintenanceTask* event is never lost between commit and enqueue (ADR-0011).
-- Separate from activity_event_outbox because that table is keyed by event id
-- alone; each consumer needs its own row for the same source event.
CREATE TABLE notification_event_outbox (
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

CREATE INDEX idx_notification_event_outbox_claimable
  ON notification_event_outbox(consumer, status, updated_at, created_at ASC, id ASC);
