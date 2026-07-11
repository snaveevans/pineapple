CREATE TABLE IF NOT EXISTS teams (
  id         TEXT NOT NULL PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id           TEXT NOT NULL PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at    TEXT NOT NULL,
  UNIQUE(team_id, user_id)
);

-- A user belongs to at most one team (one-team-per-user rule).
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
