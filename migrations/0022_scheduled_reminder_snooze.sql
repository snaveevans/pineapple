-- Snooze state for scheduled reminders (notifications-owned, issue #236).
-- Expand migration: nullable column, null means never snoozed, so no backfill.
-- Set only by an accepted snooze; cleared by every other status transition
-- (supersede, cancel, fire, reactivation) so a stale snooze never resurrects.
ALTER TABLE scheduled_reminders ADD COLUMN snoozed_until TEXT;
