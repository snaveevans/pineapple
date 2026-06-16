export type MaintenanceTaskId = string & { readonly _brand: "MaintenanceTaskId" };

export const MaintenanceTaskId = {
  generate: (): MaintenanceTaskId => crypto.randomUUID() as MaintenanceTaskId,
  from: (raw: string): MaintenanceTaskId => raw as MaintenanceTaskId,
};
