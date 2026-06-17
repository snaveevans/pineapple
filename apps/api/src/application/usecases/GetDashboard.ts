import {
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { MaintenanceTaskRepository } from "../../domain/maintenance/MaintenanceTaskRepository.ts";
import {
  compareTaskUrgency,
  deriveTaskStatus,
  mostUrgentTaskStatus,
  type TaskUrgencyStatus,
} from "../../domain/maintenance/TaskUrgency.ts";
import type { UtcDateProvider } from "../ports/UtcDateProvider.ts";

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

export type DashboardQueueItem = {
  taskId: string;
  taskTitle: string;
  nextDue: string;
  status: TaskUrgencyStatus;
  intervalValue: number;
  intervalUnit: MaintenanceTask["intervalUnit"];
  lastCompletedDate: string | null;
  createdAt: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
};

export type DashboardReadModel = {
  viewerDisplayName: string | null;
  todayUtc: string;
  fleetTotals: DashboardFleetTotals;
  fleetHealth: DashboardFleetHealth;
  queue: DashboardQueueItem[];
};

export type GetDashboardQuery = {
  ownerId: UserId;
  viewerDisplayName: string | null;
};

export class GetDashboard {
  constructor(
    private readonly assets: AssetRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly dates: UtcDateProvider,
  ) {}

  async execute(query: GetDashboardQuery): Promise<Result<DashboardReadModel, DomainError>> {
    try {
      const todayUtc = this.dates.today();
      const activeAssets = (await this.assets.findByOwner(query.ownerId)).filter(
        (asset) => asset.archivedAt === null,
      );
      const activeAssetIds = new Set(activeAssets.map((asset) => asset.id));
      const assetById = new Map(activeAssets.map((asset) => [asset.id, asset]));
      const tasks = (await this.tasks.findByOwnerForActiveAssets(query.ownerId)).filter((task) =>
        activeAssetIds.has(task.assetId),
      );

      const tasksByAsset = groupTasksByAsset(tasks);
      const fleetTotals = buildFleetTotals(activeAssets);
      const fleetHealth = buildFleetHealth(activeAssets, tasksByAsset, todayUtc);
      const queue = buildQueue(tasks, assetById, todayUtc);

      return ok({
        viewerDisplayName: query.viewerDisplayName,
        todayUtc,
        fleetTotals,
        fleetHealth,
        queue,
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}

function groupTasksByAsset(tasks: MaintenanceTask[]): Map<string, MaintenanceTask[]> {
  const grouped = new Map<string, MaintenanceTask[]>();
  for (const task of tasks) {
    const existing = grouped.get(task.assetId) ?? [];
    existing.push(task);
    grouped.set(task.assetId, existing);
  }
  return grouped;
}

function buildFleetTotals(assets: Asset[]): DashboardFleetTotals {
  return assets.reduce<DashboardFleetTotals>(
    (totals, asset) => {
      totals.total++;
      totals[asset.type]++;
      return totals;
    },
    { total: 0, vehicle: 0, equipment: 0, property: 0 },
  );
}

function buildFleetHealth(
  assets: Asset[],
  tasksByAsset: Map<string, MaintenanceTask[]>,
  todayUtc: string,
): DashboardFleetHealth {
  const health: DashboardFleetHealth = {
    overdue: 0,
    soon: 0,
    onTrack: 0,
    unscheduled: 0,
  };

  for (const asset of assets) {
    const assetTasks = tasksByAsset.get(asset.id) ?? [];
    const mostUrgent = mostUrgentTaskStatus(
      assetTasks.map((task) => deriveTaskStatus(task.nextDue, todayUtc)),
    );
    if (mostUrgent === null) {
      health.unscheduled++;
      continue;
    }
    if (mostUrgent === "overdue") health.overdue++;
    else if (mostUrgent === "soon") health.soon++;
    else health.onTrack++;
  }

  return health;
}

function buildQueue(
  tasks: MaintenanceTask[],
  assetById: Map<string, Asset>,
  todayUtc: string,
): DashboardQueueItem[] {
  const queue: DashboardQueueItem[] = [];

  for (const task of tasks) {
    const asset = assetById.get(task.assetId);
    if (!asset) continue;
    queue.push({
      taskId: task.id,
      taskTitle: task.title,
      nextDue: task.nextDue,
      status: deriveTaskStatus(task.nextDue, todayUtc),
      intervalValue: task.intervalValue,
      intervalUnit: task.intervalUnit,
      lastCompletedDate: task.lastCompletedDate,
      createdAt: task.createdAt.toISOString(),
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type,
    });
  }

  return queue.sort((left, right) => {
    const urgency = compareTaskUrgency(left.status, right.status);
    if (urgency !== 0) return urgency;
    if (left.nextDue !== right.nextDue) return left.nextDue < right.nextDue ? -1 : 1;
    return left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;
  });
}
