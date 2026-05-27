import { randomUUID } from "node:crypto";

import type { ApiClient } from "../http/client.ts";
import { enqueueOutboxEvent, getWorkspaceBinding } from "../storage/sqlite.ts";

type TaskCheckpointEvent = {
  id: string;
  taskId: string;
  source: string;
  summary: string;
  content: string;
  currentStatus?: string;
  decisions: string[];
  constraints: string[];
  nextSteps: string[];
};

export async function checkpointCommand(
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

  if (!binding.taskId) {
    input.writeStderr("No task binding found. Run `agent-continuity resolve --name <task>` first.\n");
    return 1;
  }

  const summary = args.get("summary")?.[0];

  if (!summary) {
    input.writeStderr("Missing required flag: --summary\n");
    return 1;
  }

  const event: TaskCheckpointEvent = {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    taskId: binding.taskId,
    source: args.get("source")?.[0] ?? "agent-continuity-cli",
    summary,
    content: args.get("content")?.[0] ?? summary,
    currentStatus: args.get("status")?.[0],
    decisions: args.get("decision") ?? [],
    constraints: args.get("constraint") ?? [],
    nextSteps: args.get("next-step") ?? []
  };

  try {
    await sendTaskCheckpointEvent(event, input.apiClient);
    input.writeStdout("checkpoint sent\n");
  } catch {
    enqueueOutboxEvent(input.cwd, {
      id: event.id,
      eventType: "task-checkpoint",
      payload: event
    });
    input.writeStdout("checkpoint queued\n");
  }

  return 0;
}

export async function sendTaskCheckpointEvent(event: TaskCheckpointEvent, apiClient: ApiClient) {
  await apiClient.createTaskCheckpoint(event.taskId, {
    source: event.source,
    summary: event.summary,
    content: event.content,
    current_status: event.currentStatus,
    decisions: event.decisions,
    constraints: event.constraints,
    next_steps: event.nextSteps
  });
}
