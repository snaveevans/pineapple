export type ScheduledReminderId = string & { readonly _brand: "ScheduledReminderId" };

export const ScheduledReminderId = {
  generate: (): ScheduledReminderId => crypto.randomUUID() as ScheduledReminderId,
  from: (raw: string): ScheduledReminderId => raw as ScheduledReminderId,
};
