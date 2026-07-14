-- Snapshot actor display names on activity entries (activity-history S2 / ADR-0010).
-- Pre-existing rows are backfilled from the users table so historical entries remain
-- attributable after this slice; missing names fall back to "Unknown".
ALTER TABLE activity_entries ADD COLUMN actor_display_name TEXT;

UPDATE activity_entries
SET actor_display_name = COALESCE(
  (SELECT name FROM users WHERE users.id = activity_entries.actor_id),
  'Unknown'
)
WHERE actor_display_name IS NULL;
