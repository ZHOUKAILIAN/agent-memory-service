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
    input.writeStderr("No workspace binding found. Run `agent-memory resolve` first.\n");
    return 1;
  }

  const limitFlag = args.get("limit")?.[0];
  const limit = typeof limitFlag === "string" ? Number(limitFlag) : undefined;
  const context = binding.taskId
    ? await input.apiClient.getTaskContext(binding.taskId, Number.isFinite(limit) ? limit : undefined)
    : await input.apiClient.getContext(binding.projectId, Number.isFinite(limit) ? limit : undefined);

  input.writeStdout(`${JSON.stringify(context, null, 2)}\n`);
  return 0;
}
