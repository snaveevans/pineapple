import { getPlatformProxy } from "wrangler";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { D1AgentOperationRecovery } from "../../src/infrastructure/mcp/recovery/D1AgentOperationRecovery.ts";

type RecoveryCommand = "inspect" | "dry-run" | "apply";
type ParsedArguments = {
  command: RecoveryCommand;
  actorId: string;
  operationId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE = `Usage:
  pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts inspect --actor <actor-uuid> --operation <operation-uuid>
  pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts dry-run --actor <actor-uuid> --operation <operation-uuid>
  pnpm --filter @snaveevans/pineapple-api exec tsx scripts/operator/agent-operation-recovery.ts apply --actor <actor-uuid> --operation <operation-uuid> --confirm-restore <same-operation-uuid>`;

export function parseRecoveryArguments(args: string[]): ParsedArguments {
  const [command, ...flags] = args;
  if (command !== "inspect" && command !== "dry-run" && command !== "apply") {
    throw new Error(USAGE);
  }

  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (
      (flag !== "--actor" && flag !== "--operation" && flag !== "--confirm-restore") ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(USAGE);
    }
    values.set(flag, value);
  }

  const actorId = values.get("--actor");
  const operationId = values.get("--operation");
  if (
    actorId === undefined ||
    !UUID_PATTERN.test(actorId) ||
    operationId === undefined ||
    !UUID_PATTERN.test(operationId)
  ) {
    throw new Error(USAGE);
  }
  if (command === "apply") {
    if (values.get("--confirm-restore") !== operationId) throw new Error(USAGE);
  } else if (values.has("--confirm-restore")) {
    throw new Error(USAGE);
  }
  return { command, actorId, operationId };
}

export async function runRecoveryCommand(args: string[]): Promise<number> {
  const parsed = parseRecoveryArguments(args);
  const configPath = fileURLToPath(new URL("./wrangler.agent-recovery.jsonc", import.meta.url));
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    envFiles: [],
    persist: false,
    remoteBindings: true,
  });
  try {
    const recovery = new D1AgentOperationRecovery(platform.env.DB);
    const report =
      parsed.command === "inspect"
        ? await recovery.inspect(parsed.actorId, parsed.operationId)
        : await recovery.recover(parsed.actorId, parsed.operationId, {
            apply: parsed.command === "apply",
          });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "blocked" || report.status === "not_found" ? 2 : 0;
  } finally {
    await platform.dispose();
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runRecoveryCommand(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === USAGE) {
      process.stderr.write(`${USAGE}\n`);
    } else {
      process.stderr.write("Recovery command failed. Check existing Wrangler operator access.\n");
    }
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main();
}
