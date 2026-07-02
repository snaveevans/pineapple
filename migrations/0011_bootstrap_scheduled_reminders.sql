-- One-time launch bootstrap for notifications' scheduler state.
--
-- This is the only migration/read path that seeds reminders from existing
-- maintenance-task storage. Steady-state scheduling remains event-driven via
-- enriched MaintenanceTask* messages.

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_reminders_task_cycle
  ON scheduled_reminders (maintenance_task_id, next_due);

INSERT OR IGNORE INTO scheduled_reminders (
  id,
  owner_id,
  actor_id,
  maintenance_task_id,
  asset_id,
  asset_name,
  asset_type,
  task_title,
  next_due,
  fire_at,
  status,
  last_event_id,
  last_event_occurred_at,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  t.owner_id,
  'system',
  t.id,
  a.id,
  a.name,
  a.type,
  t.title,
  t.next_due,
  date(t.next_due, '-7 days'),
  'pending',
  'bootstrap:' || t.id || ':' || t.next_due,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM maintenance_tasks t
INNER JOIN assets a ON a.id = t.asset_id
WHERE a.archived_at IS NULL;
