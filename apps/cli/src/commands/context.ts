import type { ApiClient } from "../http/client.ts";
import { getWorkspaceBinding } from "../storage/sqlite.ts";

export async function contextCommand(
  args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const binding = getWorkspaceBinding(input.cwd);

  if (!binding) {
    input.writeStderr("No workspace binding found. Run `agent-continuity resolve` first.\n");
    return 1;
  }

  const limitFlag = args.get("limit")?.[0];
  const limit = typeof limitFlag === "string" ? Number(limitFlag) : undefined;

  if (!binding.taskId) {
    input.writeStderr("No task binding found. Run `agent-continuity resolve --name <task>` first.\n");
    return 1;
  }

  const context = await input.apiClient.getTaskContext(
    binding.taskId,
    Number.isFinite(limit) ? limit : undefined
  );

  input.writeStdout(`${JSON.stringify(context, null, 2)}\n`);
  return 0;
}
