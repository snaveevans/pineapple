/**
 * The lead time, in calendar days, before a maintenance task's `nextDue` that both the
 * dashboard's `soon` status and the notifications reminder scheduler use. Defined once so the
 * two can never disagree (see docs/specs/features/notifications.md).
 */
export const MAINTENANCE_DUE_SOON_LEAD_DAYS = 7;
