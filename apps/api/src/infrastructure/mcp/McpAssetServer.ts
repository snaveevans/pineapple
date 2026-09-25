import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { User } from "../../domain/identity/User.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetListReadModel, ListAssets } from "../../application/usecases/ListAssets.ts";
import type { AssetSharingDescriptor } from "../../application/usecases/assetSharing.ts";

const SERVER_INFO = { name: "pineapple", version: "1.0.0" } as const;

const McpVehicleMetadataSchema = z.object({
  kind: z.literal("vehicle"),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  vin: z.string().optional(),
});

const McpPropertyMetadataSchema = z.object({ kind: z.literal("property") });

const McpEquipmentMetadataSchema = z.object({
  kind: z.literal("equipment"),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  serialNumber: z.string().optional(),
});

const McpAssetListSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      type: z.enum(["vehicle", "property", "equipment"]),
      metadata: z.discriminatedUnion("kind", [
        McpVehicleMetadataSchema,
        McpPropertyMetadataSchema,
        McpEquipmentMetadataSchema,
      ]),
      archivedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      sharing: z.object({
        scope: z.enum(["personal", "team"]),
        isOwner: z.boolean(),
        ownerDisplayName: z.string().optional(),
      }),
    }),
  ),
  counts: z.object({
    all: z.number().int().nonnegative(),
    vehicle: z.number().int().nonnegative(),
    property: z.number().int().nonnegative(),
    equipment: z.number().int().nonnegative(),
  }),
});

type McpAssetList = z.infer<typeof McpAssetListSchema>;

function sanitizeMetadata(metadata: AssetMetadata): McpAssetList["assets"][number]["metadata"] {
  switch (metadata.kind) {
    case "vehicle":
      return {
        kind: metadata.kind,
        make: metadata.make,
        model: metadata.model,
        year: metadata.year,
        ...(metadata.vin !== undefined ? { vin: metadata.vin } : {}),
      };
    case "property":
      // Both the asset name and free-form nickname may contain an address.
      return { kind: metadata.kind };
    case "equipment":
      return {
        kind: metadata.kind,
        ...(metadata.manufacturer !== undefined ? { manufacturer: metadata.manufacturer } : {}),
        ...(metadata.modelNumber !== undefined ? { modelNumber: metadata.modelNumber } : {}),
        ...(metadata.serialNumber !== undefined ? { serialNumber: metadata.serialNumber } : {}),
      };
  }
}

function serializeSharing(
  sharing: AssetSharingDescriptor,
): McpAssetList["assets"][number]["sharing"] {
  return {
    scope: sharing.scope,
    isOwner: sharing.isOwner,
    ...(sharing.ownerDisplayName !== undefined
      ? { ownerDisplayName: sharing.ownerDisplayName }
      : {}),
  };
}

function serializeAssetList(result: AssetListReadModel): McpAssetList {
  return {
    assets: result.assets.map(({ asset, sharing }) => ({
      id: asset.id,
      // Property names are commonly entered as street addresses in Pineapple.
      // Omit the field rather than trying to classify free-form address text.
      ...(asset.type !== "property" ? { name: asset.name } : {}),
      type: asset.type,
      metadata: sanitizeMetadata(asset.metadata),
      archivedAt: asset.archivedAt?.toISOString() ?? null,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      sharing: serializeSharing(sharing),
    })),
    counts: result.counts,
  };
}

/** Creates Pineapple's one-tool, read-only MCP surface for an authenticated user. */
export function createAssetMcpServer(
  user: User,
  listAssets: Pick<ListAssets, "execute">,
): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "list_assets",
    {
      title: "List Pineapple assets",
      description:
        "List all active Pineapple assets the authenticated user can access, including their vehicles, equipment, properties, and team-shared assets. Use this when the user explicitly asks Pineapple or naturally asks what assets they have.",
      inputSchema: z.object({}).strict(),
      outputSchema: McpAssetListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await listAssets.execute({ requesterId: user.id });
      if (!result.ok) throw result.error;

      const output = serializeAssetList(result.value);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  return server;
}

export function createAssetMcpServerFactory(deps: {
  resolveUser: (subject: unknown) => Promise<User>;
  createListAssets: (user: User) => Pick<ListAssets, "execute">;
  onAuthenticated: (user: User) => void;
}): McpServerFactory {
  return async ({ authInfo }) => {
    const user = await deps.resolveUser(authInfo?.extra?.sub);
    deps.onAuthenticated(user);
    return createAssetMcpServer(user, deps.createListAssets(user));
  };
}
