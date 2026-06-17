import {
  calendarDaysBetween,
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
  /** Task-level "ok" is surfaced as onTrack here; assets without tasks are unscheduled. */
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
  /** Signed calendar-day distance from todayUtc to nextDue; negative means overdue. */
  daysDue: number;
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
  queueCountsByCategory: DashboardQueueCounts;
  queue: DashboardQueueItem[];
};

export type GetDashboardQuery = {
  ownerId: UserId;
  viewerDisplayName: string | null;
};

type EnrichedTask = {
  task: MaintenanceTask;
  asset: Asset;
  status: TaskUrgencyStatus;
  daysDue: number;
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
      const [allAssets, tasks] = await Promise.all([
        this.assets.findByOwner(query.ownerId),
        this.tasks.findByOwnerForActiveAssets(query.ownerId),
      ]);

      const activeAssets = allAssets.filter((asset) => asset.archivedAt === null);
      const assetById = new Map(activeAssets.map((asset) => [asset.id, asset]));
      const enriched = enrichTasks(tasks, assetById, todayUtc);

      const fleetTotals = buildFleetTotals(activeAssets);
      const fleetHealth = buildFleetHealth(activeAssets, enriched);
      const queue = buildQueue(enriched);
      const queueCountsByCategory = buildQueueCounts(queue);

      return ok({
        viewerDisplayName: query.viewerDisplayName,
        todayUtc,
        fleetTotals,
        fleetHealth,
        queueCountsByCategory,
        queue,
      });
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}

function enrichTasks(
  tasks: MaintenanceTask[],
  assetById: Map<string, Asset>,
  todayUtc: string,
): EnrichedTask[] {
  return tasks.map((task) => ({
    task,
    asset: assetById.get(task.assetId)!,
    status: deriveTaskStatus(task.nextDue, todayUtc),
    daysDue: calendarDaysBetween(todayUtc, task.nextDue),
  }));
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

function buildFleetHealth(assets: Asset[], enriched: EnrichedTask[]): DashboardFleetHealth {
  const statusesByAsset = new Map<string, TaskUrgencyStatus[]>();
  for (const { task, status } of enriched) {
    const existing = statusesByAsset.get(task.assetId) ?? [];
    existing.push(status);
    statusesByAsset.set(task.assetId, existing);
  }

  const health: DashboardFleetHealth = {
    overdue: 0,
    soon: 0,
    onTrack: 0,
    unscheduled: 0,
  };

  for (const asset of assets) {
    const mostUrgent = mostUrgentTaskStatus(statusesByAsset.get(asset.id) ?? []);
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

function buildQueue(enriched: EnrichedTask[]): DashboardQueueItem[] {
  const queue = enriched.map(({ task, asset, status, daysDue }) => ({
    taskId: task.id,
    taskTitle: task.title,
    nextDue: task.nextDue,
    status,
    daysDue,
    intervalValue: task.intervalValue,
    intervalUnit: task.intervalUnit,
    lastCompletedDate: task.lastCompletedDate,
    createdAt: task.createdAt.toISOString(),
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.type,
  }));

  return queue.sort((left, right) => {
    const urgency = compareTaskUrgency(left.status, right.status);
    if (urgency !== 0) return urgency;
    if (left.nextDue !== right.nextDue) return left.nextDue < right.nextDue ? -1 : 1;
    return left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;
  });
}

function buildQueueCounts(queue: DashboardQueueItem[]): DashboardQueueCounts {
  return queue.reduce<DashboardQueueCounts>(
    (counts, item) => {
      counts.all++;
      counts[item.assetType]++;
      return counts;
    },
    { all: 0, vehicle: 0, equipment: 0, property: 0 },
  );
}
