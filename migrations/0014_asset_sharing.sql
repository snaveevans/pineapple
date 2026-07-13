-- Opt-in team sharing on assets (ADR-0015 / teams-foundation).
-- NULL = personal; non-null = shared to that team.
-- No ON DELETE: team deletion / leave-team are not implemented yet. When they
-- land, decide whether shared assets auto-unshare or block team removal so
-- rows are not left pointing at a team the owner no longer belongs to.
ALTER TABLE assets ADD COLUMN shared_team_id TEXT REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_assets_shared_team_id ON assets(shared_team_id);
