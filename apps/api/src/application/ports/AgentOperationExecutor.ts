import type {
  AssetId,
  DomainError,
  MaintenanceRecordId,
  MaintenanceTaskId,
  Result,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { IntervalUnit } from "../../domain/maintenance/IntervalUnit.ts";

export type AgentAssetMetadataPatch =
  | { kind: "vehicle"; make?: string; model?: string; year?: number; vin?: string | null }
  | {
      kind: "property";
      nickname?: string | null;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
      };
    }
  | {
      kind: "equipment";
      manufacturer?: string | null;
      modelNumber?: string | null;
      serialNumber?: string | null;
    };

type Operation = { operationId: string };
type AssetTarget = { assetId: AssetId };
type ObservedRevision = { expectedRevision: number };

export type AgentMutationCommand =
  | (Operation & { kind: "create_asset"; name: string; metadata: AssetMetadata })
  | (Operation &
      AssetTarget &
      ObservedRevision & { kind: "edit_asset"; name?: string; metadata?: AgentAssetMetadataPatch })
  | (Operation &
      AssetTarget & {
        kind: "create_maintenance_task";
        title: string;
        intervalValue: number;
        intervalUnit: IntervalUnit;
        lastCompletedDate?: string;
      })
  | (Operation &
      AssetTarget &
      ObservedRevision & {
        kind: "edit_maintenance_task";
        taskId: MaintenanceTaskId;
        title?: string;
        intervalValue?: number;
        intervalUnit?: IntervalUnit;
      })
  | (Operation &
      AssetTarget &
      ObservedRevision & {
        kind: "reschedule_maintenance_task";
        taskId: MaintenanceTaskId;
        nextDue: string;
      })
  | (Operation &
      AssetTarget & {
        kind: "record_maintenance";
        title: string;
        performedAt: string;
        notes?: string;
        taskId?: MaintenanceTaskId;
        expectedTaskRevision?: number;
      })
  | (Operation &
      AssetTarget &
      ObservedRevision & {
        kind: "edit_maintenance_record";
        recordId: MaintenanceRecordId;
        title?: string;
        performedAt?: string;
        notes?: string | null;
      });

/** Safe, durable application receipt. Private before/after evidence never crosses this port. */
export type AgentMutationReceipt = {
  operationId: string;
  replayed: boolean;
  entityType: "asset" | "task" | "record";
  entityId: string;
  assetId: string;
  appliedRevision: number;
  linkedTask?: { taskId: string; appliedRevision: number; nextDue: string };
};

export interface AgentOperationExecutor {
  execute(
    requesterId: UserId,
    command: AgentMutationCommand,
  ): Promise<Result<AgentMutationReceipt, DomainError>>;
}
