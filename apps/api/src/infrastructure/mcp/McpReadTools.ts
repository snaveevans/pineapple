import { McpServer } from "@modelcontextprotocol/server";
import { AssetId, ConflictError, ForbiddenError } from "@snaveevans/pineapple-shared";
import { z } from "zod";
import type { GetAsset } from "../../application/usecases/GetAsset.ts";
import type { GetDashboard, DashboardQueueItem } from "../../application/usecases/GetDashboard.ts";
import type { ListAssets } from "../../application/usecases/ListAssets.ts";
import type { ListMaintenanceRecords } from "../../application/usecases/ListMaintenanceRecords.ts";
import type { ListMaintenanceTasks } from "../../application/usecases/ListMaintenanceTasks.ts";
import type { AssetSharingDescriptor } from "../../application/usecases/assetSharing.ts";
import type { User } from "../../domain/identity/User.ts";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import { safeMcpError } from "./McpErrors.ts";
import {
  McpAssetListSchema,
  McpAssetMaintenanceSchema,
  McpDueMaintenanceSchema,
  McpGetAssetSchema,
  projectMcpAsset,
  projectMcpAssetList,
  projectMcpDueTask,
  projectMcpMaintenanceRecord,
  projectMcpMaintenanceTask,
} from "./McpProjection.ts";

const ASSETS_READ_SCOPE = "assets:read";
const MAINTENANCE_READ_SCOPE = "maintenance:read";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const NoArgumentsSchema = z.object({}).strict();
const AssetIdArgumentsSchema = z.object({ assetId: z.string().uuid() }).strict();

type DueAssetContext = {
  asset: Asset;
  sharing: AssetSharingDescriptor;
  tasks: Map<string, MaintenanceTask>;
};

export type McpReadDependencies = {
  listAssets: Pick<ListAssets, "execute">;
  getAsset: Pick<GetAsset, "execute">;
  getDashboard: Pick<GetDashboard, "execute">;
  listMaintenanceTasks: Pick<ListMaintenanceTasks, "execute">;
  listMaintenanceRecords: Pick<ListMaintenanceRecords, "execute">;
};

/** Registers the four read-only Pineapple tools authorized for this token. */
export function registerReadTools(
  server: McpServer,
  user: User,
  deps: McpReadDependencies,
  scopes: readonly string[],
): void {
  if (hasScopes(scopes, [ASSETS_READ_SCOPE])) {
    server.registerTool(
      "list_assets",
      {
        title: "List Pineapple assets",
        description:
          "List every active Pineapple asset the authenticated user can access, including vehicles, equipment, properties, and team-shared assets. Use this when the user asks Pineapple what assets they have. Property results include safe locality details and a stable ID, without the stored street or property name.",
        inputSchema: NoArgumentsSchema,
        outputSchema: McpAssetListSchema,
        annotations: READ_ANNOTATIONS,
      },
      async () => {
        if (!hasScopes(scopes, [ASSETS_READ_SCOPE])) return deniedReadResult();
        try {
          const result = await deps.listAssets.execute({ requesterId: user.id });
          if (!result.ok) return safeMcpError(result.error);
          return toolResult(projectMcpAssetList(result.value));
        } catch (error) {
          return safeMcpError(error);
        }
      },
    );

    server.registerTool(
      "get_asset",
      {
        title: "Get a Pineapple asset",
        description:
          "Get authorized details for one Pineapple asset by its UUID. Use this to identify an asset before editing it or to resolve ambiguity. Property results include locality and a stable ID, without the stored street or property name.",
        inputSchema: AssetIdArgumentsSchema,
        outputSchema: McpGetAssetSchema,
        annotations: READ_ANNOTATIONS,
      },
      async ({ assetId }) => {
        if (!hasScopes(scopes, [ASSETS_READ_SCOPE])) return deniedReadResult();
        try {
          const result = await deps.getAsset.execute({
            assetId: AssetId.from(assetId),
            requesterId: user.id,
          });
          if (!result.ok) return safeMcpError(result.error);
          return toolResult({ asset: projectMcpAsset(result.value) });
        } catch (error) {
          return safeMcpError(error);
        }
      },
    );
  }

  if (hasScopes(scopes, [ASSETS_READ_SCOPE, MAINTENANCE_READ_SCOPE])) {
    server.registerTool(
      "get_due_maintenance",
      {
        title: "Get due Pineapple maintenance",
        description:
          "Show current overdue, due-today, and due-soon Pineapple maintenance in the server's urgency order. Use this for questions about what is due today, soon, or overdue. Due status, days remaining, and ordering come from Pineapple's dashboard. This tool does not make recommendations or include on-track work.",
        inputSchema: NoArgumentsSchema,
        outputSchema: McpDueMaintenanceSchema,
        annotations: READ_ANNOTATIONS,
      },
      async () => {
        if (!hasScopes(scopes, [ASSETS_READ_SCOPE, MAINTENANCE_READ_SCOPE])) {
          return deniedReadResult();
        }
        try {
          const dashboardResult = await deps.getDashboard.execute({
            ownerId: user.id,
            viewerDisplayName: null,
          });
          if (!dashboardResult.ok) return safeMcpError(dashboardResult.error);

          // Keep the dashboard's date, due conclusions, and order. The asset and
          // task reads only supply the revision and safe property locality that
          // the dashboard's public queue does not carry.
          const dueRows = dashboardResult.value.queue.filter((row) => row.status !== "ok");
          const contextByAssetId = await loadDueAssetContexts(dueRows, user, deps);
          const tasks = dueRows.map((row) => {
            const context = contextByAssetId.get(row.assetId);
            const task = context?.tasks.get(row.taskId);
            if (context === undefined || task === undefined) {
              throw new Error("Dashboard maintenance context is unavailable");
            }
            if (!matchesDashboardRow(row, context.asset, task)) {
              throw new Error("Dashboard maintenance context changed during the read");
            }
            return projectMcpDueTask(row, {
              asset: context.asset,
              sharing: context.sharing,
              task,
            });
          });

          return toolResult({ todayUtc: dashboardResult.value.todayUtc, tasks });
        } catch (error) {
          return safeMcpError(error);
        }
      },
    );

    server.registerTool(
      "get_asset_maintenance",
      {
        title: "Get Pineapple asset maintenance history",
        description:
          "Get safe context for one authorized Pineapple asset, including all current maintenance tasks and reverse-chronological maintenance records. Use this before scheduling work, logging completed maintenance, or correcting a record. Property streets are never returned, and address literals in task and record text are redacted.",
        inputSchema: AssetIdArgumentsSchema,
        outputSchema: McpAssetMaintenanceSchema,
        annotations: READ_ANNOTATIONS,
      },
      async ({ assetId }) => {
        if (!hasScopes(scopes, [ASSETS_READ_SCOPE, MAINTENANCE_READ_SCOPE])) {
          return deniedReadResult();
        }
        try {
          const assetResult = await deps.getAsset.execute({
            assetId: AssetId.from(assetId),
            requesterId: user.id,
          });
          if (!assetResult.ok) return safeMcpError(assetResult.error);

          const id = assetResult.value.asset.id;
          const [tasksResult, recordsResult] = await Promise.all([
            deps.listMaintenanceTasks.execute({ assetId: id, requesterId: user.id }),
            deps.listMaintenanceRecords.execute({ assetId: id, requesterId: user.id }),
          ]);
          if (!tasksResult.ok) return safeMcpError(tasksResult.error);
          if (!recordsResult.ok) return safeMcpError(recordsResult.error);
          await assertPropertyContextUnchanged(assetResult.value.asset, user, deps);

          const street =
            assetResult.value.asset.metadata.kind === "property"
              ? assetResult.value.asset.metadata.address.street
              : undefined;
          const records = [...recordsResult.value].sort(
            (left, right) =>
              right.performedAt.localeCompare(left.performedAt) ||
              right.createdAt.toISOString().localeCompare(left.createdAt.toISOString()),
          );
          return toolResult({
            asset: projectMcpAsset(assetResult.value),
            maintenanceTasks: tasksResult.value.map((task) =>
              projectMcpMaintenanceTask(task, street),
            ),
            maintenanceRecords: records.map((record) =>
              projectMcpMaintenanceRecord(record, street),
            ),
          });
        } catch (error) {
          return safeMcpError(error);
        }
      },
    );
  }
}

async function loadDueAssetContexts(
  rows: DashboardQueueItem[],
  user: User,
  deps: McpReadDependencies,
): Promise<Map<string, DueAssetContext>> {
  const assetIds = [...new Set(rows.map((row) => row.assetId))];
  const contexts = await Promise.all(
    assetIds.map(async (assetId) => {
      const id = AssetId.from(assetId);
      const [assetResult, tasksResult] = await Promise.all([
        deps.getAsset.execute({ assetId: id, requesterId: user.id }),
        deps.listMaintenanceTasks.execute({ assetId: id, requesterId: user.id }),
      ]);
      if (!assetResult.ok) throw assetResult.error;
      if (!tasksResult.ok) throw tasksResult.error;
      await assertPropertyContextUnchanged(assetResult.value.asset, user, deps);
      return [
        assetId,
        {
          asset: assetResult.value.asset,
          sharing: assetResult.value.sharing,
          tasks: new Map(tasksResult.value.map((task) => [task.id, task])),
        },
      ] as const;
    }),
  );
  return new Map(contexts);
}

async function assertPropertyContextUnchanged(
  observed: Asset,
  user: User,
  deps: McpReadDependencies,
): Promise<void> {
  if (observed.metadata.kind !== "property") return;
  // Context comes from separate authorized application reads. Do not sanitize
  // newer text using a street captured before a concurrent property edit.
  const current = await deps.getAsset.execute({
    assetId: observed.id,
    requesterId: user.id,
  });
  if (!current.ok) throw current.error;
  const asset = current.value.asset;
  if (
    asset.revision !== observed.revision ||
    asset.updatedAt.toISOString() !== observed.updatedAt.toISOString() ||
    asset.sharedTeamId !== observed.sharedTeamId ||
    JSON.stringify(asset.metadata) !== JSON.stringify(observed.metadata)
  ) {
    throw new ConflictError("Property context changed during the read.");
  }
}

function matchesDashboardRow(
  row: DashboardQueueItem,
  asset: Asset,
  task: MaintenanceTask,
): boolean {
  return (
    task.assetId === asset.id &&
    task.title === row.taskTitle &&
    task.nextDue === row.nextDue &&
    task.intervalValue === row.intervalValue &&
    task.intervalUnit === row.intervalUnit &&
    task.lastCompletedDate === row.lastCompletedDate &&
    asset.type === row.assetType
  );
}

function hasScopes(scopes: readonly string[], required: readonly string[]): boolean {
  return required.every((scope) => scopes.includes(scope));
}

function deniedReadResult() {
  return safeMcpError(new ForbiddenError("MCP read scope is required"));
}

function toolResult(output: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}
