-- Opt-in team sharing on assets (ADR-0015 / teams-foundation).
-- NULL = personal; non-null = shared to that team.
ALTER TABLE assets ADD COLUMN shared_team_id TEXT REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_assets_shared_team_id ON assets(shared_team_id);
