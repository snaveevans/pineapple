export interface MaintenanceWriteGate {
  isWritable(): Promise<boolean>;
}
