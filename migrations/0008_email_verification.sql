-- Email verification token store and send audit / rate-limit records.
-- Separate from Better Auth's singular `verification` table (auth infra).
-- Tokens are stored hashed at rest and scoped by (user, email, purpose).

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE UNIQUE INDEX idx_email_verification_tokens_hash
  ON email_verification_tokens (token_hash);

CREATE INDEX idx_email_verification_tokens_scope
  ON email_verification_tokens (user_id, email, purpose);

-- One row per verification send attempt. Backs the cooldown, per-address, and
-- per-user rolling-24h rate limits and doubles as an audit trail.
CREATE TABLE email_verification_sends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_email_verification_sends_address
  ON email_verification_sends (email, purpose, created_at);

CREATE INDEX idx_email_verification_sends_user
  ON email_verification_sends (user_id, purpose, created_at);
