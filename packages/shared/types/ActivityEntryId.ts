export type ActivityEntryId = string & { readonly _brand: "ActivityEntryId" };

export const ActivityEntryId = {
  generate: (): ActivityEntryId => crypto.randomUUID() as ActivityEntryId,
  from: (raw: string): ActivityEntryId => raw as ActivityEntryId,
};
