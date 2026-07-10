-- Teams foundation (ADR-0015): a team is a named group a user opts into.
-- A user belongs to at most one team, enforced here via UNIQUE(user_id) —
-- membership rows are never shared across teams.

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT NOT NULL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id    TEXT NOT NULL REFERENCES teams(id),
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id),
  role       TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
