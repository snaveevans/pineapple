import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  ForbiddenError,
  ServiceUnavailableError,
} from "@snaveevans/pineapple-shared";
import type {
  AgentMutationCommand,
  AgentOperationExecutor,
} from "../../application/ports/AgentOperationExecutor.ts";
import type { User } from "../../domain/identity/User.ts";
import { isValidDateOnly } from "../../domain/maintenance/DateOnly.ts";
import { safeMcpError } from "./McpErrors.ts";

const uuid = z.string().uuid();
const revision = z.number().int().nonnegative();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDateOnly, "Date must be a valid calendar date");
const title = z.string().trim().min(1).max(100);
const notes = z.string().trim().max(1000);
const intervalValue = z.number().int().min(1);
const intervalUnit = z.enum(["day", "week", "month", "year"]);
const name = z.string().min(1);
const address = z
  .object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
  })
  .strict();
const vehicle = z
  .object({
    kind: z.literal("vehicle"),
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
    vin: z.string().optional(),
  })
  .strict();
const property = z
  .object({ kind: z.literal("property"), nickname: z.string().optional(), address })
  .strict();
const equipment = z
  .object({
    kind: z.literal("equipment"),
    manufacturer: z.string().optional(),
    modelNumber: z.string().optional(),
    serialNumber: z.string().optional(),
  })
  .strict();
const metadata = z.discriminatedUnion("kind", [vehicle, property, equipment]);
const optionalText = z.string().nullable().optional();
const addressPatch = address
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one address field");
const metadataPatch = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("vehicle"),
        make: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        year: z.number().int().optional(),
        vin: optionalText,
      })
      .strict(),
    z
      .object({
        kind: z.literal("property"),
        nickname: optionalText,
        address: addressPatch.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("equipment"),
        manufacturer: optionalText,
        modelNumber: optionalText,
        serialNumber: optionalText,
      })
      .strict(),
  ])
  .refine(
    (value) => Object.keys(value).some((key) => key !== "kind"),
    "Supply at least one metadata field",
  );
const operation = { operationId: uuid };
const target = { ...operation, assetId: uuid };
const observed = { ...target, expectedRevision: revision };
const schemas = {
  create_asset: z.object({ ...operation, name, metadata }).strict(),
  edit_asset: z
    .object({ ...observed, name: name.optional(), metadata: metadataPatch.optional() })
    .strict()
    .refine(
      (args) => args.name !== undefined || args.metadata !== undefined,
      "Supply name or metadata",
    ),
  create_maintenance_task: z
    .object({
      ...target,
      title,
      intervalValue,
      intervalUnit,
      lastCompletedDate: dateOnly.optional(),
    })
    .strict(),
  edit_maintenance_task: z
    .object({
      ...observed,
      taskId: uuid,
      title: title.optional(),
      intervalValue: intervalValue.optional(),
      intervalUnit: intervalUnit.optional(),
    })
    .strict()
    .refine(
      (args) =>
        args.title !== undefined ||
        args.intervalValue !== undefined ||
        args.intervalUnit !== undefined,
      "Supply a title or recurrence field",
    ),
  reschedule_maintenance_task: z.object({ ...observed, taskId: uuid, nextDue: dateOnly }).strict(),
  record_maintenance: z
    .object({
      ...target,
      title,
      performedAt: dateOnly,
      notes: notes.optional(),
      taskId: uuid.optional(),
      expectedTaskRevision: revision.optional(),
    })
    .strict()
    .refine(
      (args) => (args.taskId === undefined) === (args.expectedTaskRevision === undefined),
      "Supply both taskId and expectedTaskRevision when linking maintenance",
    ),
  edit_maintenance_record: z
    .object({
      ...observed,
      recordId: uuid,
      title: title.optional(),
      performedAt: dateOnly.optional(),
      notes: notes.nullable().optional(),
    })
    .strict()
    .refine(
      (args) =>
        args.title !== undefined || args.performedAt !== undefined || args.notes !== undefined,
      "Supply title, performedAt, or notes",
    ),
};

const receiptSchema = z
  .object({
    operationId: uuid,
    replayed: z.boolean(),
    entityType: z.enum(["asset", "task", "record"]),
    entityId: uuid,
    assetId: uuid,
    appliedRevision: revision,
    linkedTask: z
      .object({ taskId: uuid, appliedRevision: revision, nextDue: dateOnly })
      .strict()
      .optional(),
  })
  .strict();
const outputSchema = z.object({ receipt: receiptSchema }).strict();

const descriptions: Record<AgentMutationCommand["kind"], string> = {
  create_asset:
    "Create a vehicle, property, or equipment asset after the user explicitly asks. Property street is user-supplied input and is never returned. Use one new operationId UUID per intended action and reuse it on timeout/retry.",
  edit_asset:
    "Edit an owned asset after the user explicitly asks. Read get_asset first and send its expectedRevision. Omitted fields are preserved; null clears optional fields. Property street is never returned. Reuse operationId on timeout/retry; refresh context after a conflict.",
  create_maintenance_task:
    "Create a recurring maintenance schedule after the user explicitly asks. Inspect get_asset_maintenance first. The server computes the due date from recurrence and optional completion date. Reuse operationId on timeout/retry.",
  edit_maintenance_task:
    "Edit a schedule title or recurrence after the user explicitly asks. Read get_asset_maintenance first and send the task's expectedRevision. Reuse operationId on timeout/retry; refresh context after a conflict.",
  reschedule_maintenance_task:
    "Move a schedule's current due date strictly after today UTC after the user explicitly asks. This does not record completed work. Send the task's current expectedRevision. Reuse operationId on timeout/retry; refresh context after a conflict.",
  record_maintenance:
    "Record explicitly completed maintenance on its actual performed date. Inspect get_asset_maintenance first. A linked task requires its current expectedTaskRevision and may advance its schedule. Reuse operationId on timeout/retry; refresh context after a conflict.",
  edit_maintenance_record:
    "Correct an existing maintenance record after the user explicitly asks. Read get_asset_maintenance first and send the record's expectedRevision. Null clears notes; linked schedule reconciliation is server-owned. Reuse operationId on timeout/retry; refresh context after a conflict.",
};

function toCommand(
  kind: AgentMutationCommand["kind"],
  args: Record<string, unknown>,
): AgentMutationCommand {
  // Strict per-tool schemas validate the wire union; branded IDs are constructed at this boundary.
  return {
    ...args,
    kind,
    ...(typeof args["assetId"] === "string" ? { assetId: AssetId.from(args["assetId"]) } : {}),
    ...(typeof args["taskId"] === "string"
      ? { taskId: MaintenanceTaskId.from(args["taskId"]) }
      : {}),
    ...(typeof args["recordId"] === "string"
      ? { recordId: MaintenanceRecordId.from(args["recordId"]) }
      : {}),
  } as AgentMutationCommand;
}

/** Discovery and execution both enforce grants and the emergency write switch. */
export function registerWriteTools(
  server: McpServer,
  user: User,
  executor: AgentOperationExecutor,
  scopes: readonly string[],
  writesEnabled: () => boolean,
): void {
  for (const kind of Object.keys(schemas) as Array<keyof typeof schemas>) {
    const requiredScopes = [
      "assets:read",
      kind.endsWith("asset") ? "assets:write" : "maintenance:write",
    ];
    const authorized = () => requiredScopes.every((scope) => scopes.includes(scope));
    if (!authorized() || !writesEnabled()) continue;
    server.registerTool(
      kind,
      {
        title: kind.replaceAll("_", " "),
        description: descriptions[kind],
        inputSchema: schemas[kind],
        outputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: !["create_asset", "create_maintenance_task"].includes(kind),
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          if (!authorized()) return safeMcpError(new ForbiddenError("Missing scope"));
          if (!writesEnabled()) return safeMcpError(new ServiceUnavailableError("Writes disabled"));
          const result = await executor.execute(user.id, toCommand(kind, args));
          if (!result.ok) return safeMcpError(result.error, true);
          // Parse the receipt to reject accidental private fields crossing the application port.
          const output = outputSchema.parse({ receipt: result.value });
          return {
            structuredContent: output,
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
          };
        } catch (error) {
          return safeMcpError(error, true);
        }
      },
    );
  }
}
