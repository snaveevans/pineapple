import { apiRequest } from "./client.ts";

export type TaskUrgencyStatus = "overdue" | "soon" | "ok";
export type AssetType = "vehicle" | "property" | "equipment";

export type DashboardFleetTotals = {
  total: number;
  vehicle: number;
  equipment: number;
  property: number;
};

export type DashboardFleetHealth = {
  overdue: number;
  soon: number;
  onTrack: number;
  unscheduled: number;
};

export type DashboardQueueCounts = {
  all: number;
  vehicle: number;
  equipment: number;
  property: number;
};

export type DashboardQueueItem = {
  taskId: string;
  taskTitle: string;
  nextDue: string;
  status: TaskUrgencyStatus;
  intervalValue: number;
  intervalUnit: "day" | "week" | "month" | "year";
  lastCompletedDate: string | null;
  createdAt: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
};

export type DashboardResponse = {
  viewerDisplayName: string | null;
  todayUtc: string;
  fleetTotals: DashboardFleetTotals;
  fleetHealth: DashboardFleetHealth;
  queueCountsByCategory: DashboardQueueCounts;
  queue: DashboardQueueItem[];
};

export const dashboardQueryKey = ["dashboard"] as const;

export function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>("/api/dashboard");
}
