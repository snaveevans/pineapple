import { z } from "zod";
import type { DashboardQueueItem } from "../../application/usecases/GetDashboard.ts";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { PropertyMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetSharingDescriptor } from "../../application/usecases/assetSharing.ts";
import type { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import type { AssetListReadModel } from "../../application/usecases/ListAssets.ts";

const IntervalUnitSchema = z.enum(["day", "week", "month", "year"]);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const McpSharingSchema = z
  .object({
    scope: z.enum(["personal", "team"]),
    isOwner: z.boolean(),
    ownerDisplayName: z.string().optional(),
  })
  .strict();

const McpVehicleMetadataSchema = z
  .object({
    kind: z.literal("vehicle"),
    make: z.string(),
    model: z.string(),
    year: z.number().int(),
    vin: z.string().optional(),
  })
  .strict();

const McpPropertyMetadataSchema = z
  .object({
    kind: z.literal("property"),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .strict();

const McpEquipmentMetadataSchema = z
  .object({
    kind: z.literal("equipment"),
    manufacturer: z.string().optional(),
    modelNumber: z.string().optional(),
    serialNumber: z.string().optional(),
  })
  .strict();

const McpAssetBaseSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    archivedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    sharing: McpSharingSchema,
  })
  .strict();

export const McpAssetSchema = z.discriminatedUnion("type", [
  McpAssetBaseSchema.extend({
    name: z.string(),
    type: z.literal("vehicle"),
    metadata: McpVehicleMetadataSchema,
  }),
  McpAssetBaseSchema.extend({
    label: z.string(),
    type: z.literal("property"),
    metadata: McpPropertyMetadataSchema,
  }),
  McpAssetBaseSchema.extend({
    name: z.string(),
    type: z.literal("equipment"),
    metadata: McpEquipmentMetadataSchema,
  }),
]);

const McpMaintenanceTaskSchema = z
  .object({
    id: z.string().uuid(),
    assetId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    title: z.string(),
    intervalValue: z.number().int().positive(),
    intervalUnit: IntervalUnitSchema,
    lastCompletedDate: DateOnlySchema.nullable(),
    nextDue: DateOnlySchema,
    createdAt: z.string().datetime(),
  })
  .strict();

const McpMaintenanceRecordSchema = z
  .object({
    id: z.string().uuid(),
    assetId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    taskId: z.string().uuid().nullable(),
    title: z.string(),
    performedAt: DateOnlySchema,
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const McpAssetListSchema = z
  .object({
    assets: z.array(McpAssetSchema),
    counts: z
      .object({
        all: z.number().int().nonnegative(),
        vehicle: z.number().int().nonnegative(),
        property: z.number().int().nonnegative(),
        equipment: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const McpGetAssetSchema = z.object({ asset: McpAssetSchema }).strict();

const McpDueTaskSchema = z
  .object({
    taskId: z.string().uuid(),
    assetId: z.string().uuid(),
    taskRevision: z.number().int().nonnegative(),
    assetRevision: z.number().int().nonnegative(),
    taskTitle: z.string(),
    nextDue: DateOnlySchema,
    status: z.enum(["overdue", "soon"]),
    daysDue: z.number().int(),
    intervalValue: z.number().int().positive(),
    intervalUnit: IntervalUnitSchema,
    lastCompletedDate: DateOnlySchema.nullable(),
    assetLabel: z.string(),
    assetType: z.enum(["vehicle", "property", "equipment"]),
    sharing: McpSharingSchema,
  })
  .strict();

export const McpDueMaintenanceSchema = z
  .object({
    todayUtc: DateOnlySchema,
    tasks: z.array(McpDueTaskSchema),
  })
  .strict();

export const McpAssetMaintenanceSchema = z
  .object({
    asset: McpAssetSchema,
    maintenanceTasks: z.array(McpMaintenanceTaskSchema),
    maintenanceRecords: z.array(McpMaintenanceRecordSchema),
  })
  .strict();

export type McpAsset = z.infer<typeof McpAssetSchema>;
export type McpAssetList = z.infer<typeof McpAssetListSchema>;
export type McpDueMaintenance = z.infer<typeof McpDueMaintenanceSchema>;
export type McpAssetMaintenance = z.infer<typeof McpAssetMaintenanceSchema>;

export function projectMcpAsset(input: {
  asset: Asset;
  sharing: AssetSharingDescriptor;
}): McpAsset {
  const { asset } = input;
  const common = {
    id: asset.id,
    revision: asset.revision,
    archivedAt: asset.archivedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };

  switch (asset.metadata.kind) {
    case "vehicle":
      return {
        ...common,
        name: asset.name,
        type: "vehicle",
        metadata: {
          kind: asset.metadata.kind,
          make: asset.metadata.make,
          model: asset.metadata.model,
          year: asset.metadata.year,
          ...(asset.metadata.vin !== undefined ? { vin: asset.metadata.vin } : {}),
        },
        sharing: projectMcpSharing(input.sharing),
      };
    case "property":
      return {
        ...common,
        label: propertyLabel(asset.metadata, asset.id),
        type: "property",
        metadata: projectPropertyMetadata(asset.metadata),
        sharing: projectMcpSharing(input.sharing, asset.metadata.address.street),
      };
    case "equipment":
      return {
        ...common,
        name: asset.name,
        type: "equipment",
        metadata: {
          kind: asset.metadata.kind,
          ...(asset.metadata.manufacturer !== undefined
            ? { manufacturer: asset.metadata.manufacturer }
            : {}),
          ...(asset.metadata.modelNumber !== undefined
            ? { modelNumber: asset.metadata.modelNumber }
            : {}),
          ...(asset.metadata.serialNumber !== undefined
            ? { serialNumber: asset.metadata.serialNumber }
            : {}),
        },
        sharing: projectMcpSharing(input.sharing),
      };
  }
}

export function projectMcpAssetList(result: AssetListReadModel): McpAssetList {
  return {
    assets: result.assets.map(projectMcpAsset),
    counts: result.counts,
  };
}

export function projectMcpAssetLabel(asset: Asset): string {
  return asset.metadata.kind === "property" ? propertyLabel(asset.metadata, asset.id) : asset.name;
}

export function projectMcpDueTask(
  row: DashboardQueueItem,
  context: { asset: Asset; sharing: AssetSharingDescriptor; task: MaintenanceTask },
): McpDueMaintenance["tasks"][number] {
  const street =
    context.asset.metadata.kind === "property" ? context.asset.metadata.address.street : undefined;
  return {
    taskId: row.taskId,
    assetId: row.assetId,
    taskRevision: context.task.revision,
    assetRevision: context.asset.revision,
    taskTitle: street === undefined ? row.taskTitle : redactPropertyText(row.taskTitle, street),
    nextDue: row.nextDue,
    status: row.status === "overdue" ? "overdue" : "soon",
    daysDue: row.daysDue,
    intervalValue: row.intervalValue,
    intervalUnit: row.intervalUnit,
    lastCompletedDate: row.lastCompletedDate,
    assetLabel: projectMcpAssetLabel(context.asset),
    assetType: row.assetType,
    sharing: projectMcpSharing(context.sharing, street),
  };
}

export function projectMcpMaintenanceTask(
  task: MaintenanceTask,
  street?: string,
): z.infer<typeof McpMaintenanceTaskSchema> {
  return {
    id: task.id,
    assetId: task.assetId,
    revision: task.revision,
    title: street === undefined ? task.title : redactPropertyText(task.title, street),
    intervalValue: task.intervalValue,
    intervalUnit: task.intervalUnit,
    lastCompletedDate: task.lastCompletedDate,
    nextDue: task.nextDue,
    createdAt: task.createdAt.toISOString(),
  };
}

export function projectMcpMaintenanceRecord(
  record: MaintenanceRecord,
  street?: string,
): z.infer<typeof McpMaintenanceRecordSchema> {
  const redact = (value: string | null): string | null =>
    value === null || street === undefined ? value : redactPropertyText(value, street);

  return {
    id: record.id,
    assetId: record.assetId,
    revision: record.revision,
    taskId: record.taskId,
    title: street === undefined ? record.title : redactPropertyText(record.title, street),
    performedAt: record.performedAt,
    notes: redact(record.notes),
    createdAt: record.createdAt.toISOString(),
  };
}

export function redactPropertyText(value: string, street: string): string {
  const trimmedStreet = street.trim();
  if (trimmedStreet.length === 0) return value;

  const normalizedStreet = escapeRegExp(trimmedStreet).replace(/\s+/g, "\\s+");
  const exactStreetPattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${normalizedStreet}(?=$|[^\\p{L}\\p{N}])`,
    "giu",
  );
  let safe = value.replace(exactStreetPattern, "$1[redacted address]");

  const leadingAddress = leadingHouseNumberStreetPattern(trimmedStreet);
  if (leadingAddress !== null) {
    const leadingAddressPattern = new RegExp(
      `(^[ \\t]*|[\\r\\n][ \\t]*|\\baddress[ \\t]*(?::|=|is)[ \\t]*)${leadingAddress}(?:\\s+${STREET_SUFFIX_PATTERN})?(?=$|[\\s,;.!?:])`,
      "giu",
    );
    safe = safe.replace(leadingAddressPattern, "$1[redacted address]");
  }

  return safe;
}

function projectPropertyMetadata(metadata: PropertyMetadata) {
  return {
    kind: "property" as const,
    city: metadata.address.city,
    state: metadata.address.state,
    postalCode: metadata.address.postalCode,
    country: metadata.address.country,
  };
}

function projectMcpSharing(sharing: AssetSharingDescriptor, street?: string) {
  return {
    scope: sharing.scope,
    isOwner: sharing.isOwner,
    ...(sharing.ownerDisplayName !== undefined
      ? {
          ownerDisplayName:
            street === undefined
              ? sharing.ownerDisplayName
              : redactPropertyText(sharing.ownerDisplayName, street),
        }
      : {}),
  };
}

function propertyLabel(metadata: PropertyMetadata, id: string): string {
  const locality = [
    metadata.address.city,
    metadata.address.state,
    metadata.address.postalCode,
    metadata.address.country,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
  return locality.length === 0 ? `Property (${id})` : `Property in ${locality} (${id})`;
}

function leadingHouseNumberStreetPattern(street: string): string | null {
  const leadingNumber = /^(\d+(?:[-/]\d+)?[a-z]?)\s+(.+)$/iu.exec(street);
  if (!leadingNumber) return null;
  const houseNumber = leadingNumber[1];
  const streetAndSuffix = leadingNumber[2];
  if (houseNumber === undefined || streetAndSuffix === undefined) return null;

  const words = streetAndSuffix.split(/\s+/u);
  const suffixIndex = words.findIndex((word) =>
    STREET_SUFFIXES.has(word.replace(/\.$/u, "").toLowerCase()),
  );
  const streetNameWords = suffixIndex > 0 ? words.slice(0, suffixIndex) : words;
  if (streetNameWords.length === 0) return null;
  const escapedName = streetNameWords.map(escapeRegExp).join("\\s+");
  return `${escapeRegExp(houseNumber)}\\s+${escapedName}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STREET_SUFFIXES = new Set([
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "boulevard",
  "blvd",
  "drive",
  "dr",
  "lane",
  "ln",
  "court",
  "ct",
  "circle",
  "cir",
  "way",
  "terrace",
  "ter",
  "trail",
  "trl",
  "parkway",
  "pkwy",
  "place",
  "pl",
  "loop",
  "highway",
  "hwy",
]);

const STREET_SUFFIX_PATTERN =
  "(?:street|st\\.?|road|rd\\.?|avenue|ave\\.?|boulevard|blvd\\.?|drive|dr\\.?|lane|ln\\.?|court|ct\\.?|circle|cir\\.?|way|terrace|ter\\.?|trail|trl\\.?|parkway|pkwy\\.?|place|pl\\.?|loop|highway|hwy\\.?)";
