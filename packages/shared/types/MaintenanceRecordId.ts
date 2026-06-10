export type MaintenanceRecordId = string & { readonly _brand: "MaintenanceRecordId" };

export const MaintenanceRecordId = {
  generate: (): MaintenanceRecordId => crypto.randomUUID() as MaintenanceRecordId,
  from: (raw: string): MaintenanceRecordId => raw as MaintenanceRecordId,
};
