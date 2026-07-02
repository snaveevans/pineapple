-- Outbound reminder-email jobs are staged in D1 with the sweep's notification
-- and email-batch writes. The later queue relay moves these rows to the
-- Cloudflare Queue, preserving the same producer-side integrity pattern used by
-- notification_event_outbox.

ALTER TABLE notifications ADD COLUMN email_batch_id TEXT;

CREATE INDEX idx_notifications_email_batch
  ON notifications (email_batch_id)
  WHERE email_batch_id IS NOT NULL;

CREATE TABLE notification_email_outbox (
  id           TEXT NOT NULL PRIMARY KEY,
  batch_id     TEXT NOT NULL UNIQUE,
  owner_id     TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  sent_at      TEXT,
  delivered_at TEXT
);

CREATE INDEX idx_notification_email_outbox_claimable
  ON notification_email_outbox(status, updated_at, created_at ASC, id ASC);
