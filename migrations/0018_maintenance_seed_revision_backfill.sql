-- Backfill schedule_seed_date and initial_last_completed_date on legacy maintenance_tasks.

UPDATE maintenance_tasks
SET
  schedule_seed_date = COALESCE(last_completed_date, substr(created_at, 1, 10)),
  initial_last_completed_date = last_completed_date
WHERE schedule_seed_date IS NULL;
