-- Add nullable next_due_override for one-cycle task rescheduling (issue #235).
-- Expand/contract policy: existing rows and old writers use NULL; no backfill
-- is required. The new writer persists the future target on reschedule and
-- clears it on interval edit or a successful task advance. No code may infer
-- an override from a matching next_due value.
ALTER TABLE maintenance_tasks ADD COLUMN next_due_override TEXT;
