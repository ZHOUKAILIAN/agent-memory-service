import { randomUUID } from "node:crypto";

import type { ApiClient, ConversationPayload, MemoryBlockPayload } from "../http/client.ts";
import { enqueueOutboxEvent, getWorkspaceBinding } from "../storage/sqlite.ts";

type CheckpointEvent = {
  id: string;
  projectId: string;
  source: string;
  summary: string;
  content: string;
  status?: string;
  decisions: string[];
  constraints: string[];
  nextSteps: string[];
};

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
    input.writeStderr("No workspace binding found. Run `agent-memory resolve` first.\n");
    return 1;
  }

  const summary = args.get("summary")?.[0];

  if (!summary) {
    input.writeStderr("Missing required flag: --summary\n");
    return 1;
  }

  const event: CheckpointEvent = {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    projectId: binding.projectId,
    source: args.get("source")?.[0] ?? "agent-memory-cli",
    summary,
    content: args.get("content")?.[0] ?? summary,
    status: args.get("status")?.[0],
    decisions: args.get("decision") ?? [],
    constraints: args.get("constraint") ?? [],
    nextSteps: args.get("next-step") ?? []
  };

  if (binding.taskId) {
    const taskEvent: TaskCheckpointEvent = {
      id: event.id,
      taskId: binding.taskId,
      source: event.source,
      summary: event.summary,
      content: event.content,
      currentStatus: event.status,
      decisions: event.decisions,
      constraints: event.constraints,
      nextSteps: event.nextSteps
    };

    try {
      await sendTaskCheckpointEvent(taskEvent, input.apiClient);
      input.writeStdout("checkpoint sent\n");
    } catch {
      enqueueOutboxEvent(input.cwd, {
        id: taskEvent.id,
        eventType: "task-checkpoint",
        payload: taskEvent
      });
      input.writeStdout("checkpoint queued\n");
    }

    return 0;
  }

  try {
    await sendCheckpointEvent(event, input.apiClient);
    input.writeStdout("checkpoint sent\n");
  } catch {
    enqueueOutboxEvent(input.cwd, {
      id: event.id,
      eventType: "checkpoint",
      payload: event
    });
    input.writeStdout("checkpoint queued\n");
  }

  return 0;
}

export async function sendCheckpointEvent(event: CheckpointEvent, apiClient: ApiClient) {
  for (const memoryBlock of buildMemoryBlocks(event)) {
    await apiClient.upsertMemoryBlock(event.projectId, memoryBlock);
  }

  await apiClient.createConversationEntry(
    event.projectId,
    buildConversationPayload(event)
  );
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

function buildConversationPayload(event: CheckpointEvent): ConversationPayload {
  return {
    source: event.source,
    entry_type: "checkpoint",
    actor: "system",
    content: renderCheckpointContent(event),
    summary: event.summary,
    tags: ["checkpoint", event.source]
  };
}

function buildMemoryBlocks(event: CheckpointEvent) {
  const blocks: MemoryBlockPayload[] = [];

  if (event.status) {
    blocks.push({
      block_type: "status",
      title: "Current status",
      content: event.status,
      source: event.source,
      importance: 0.8
    });
  }

  for (const decision of event.decisions) {
    blocks.push({
      block_type: "decisions",
      title: decision,
      content: decision,
      source: event.source,
      importance: 0.9
    });
  }

  for (const constraint of event.constraints) {
    blocks.push({
      block_type: "constraints",
      title: constraint,
      content: constraint,
      source: event.source,
      importance: 0.85
    });
  }

  for (const nextStep of event.nextSteps) {
    blocks.push({
      block_type: "todo",
      title: nextStep,
      content: nextStep,
      source: event.source,
      importance: 0.75
    });
  }

  return blocks;
}

function renderCheckpointContent(event: CheckpointEvent) {
  const lines = [`Summary: ${event.summary}`];

  if (event.status) {
    lines.push(`Status: ${event.status}`);
  }

  for (const decision of event.decisions) {
    lines.push(`Decision: ${decision}`);
  }

  for (const constraint of event.constraints) {
    lines.push(`Constraint: ${constraint}`);
  }

  for (const nextStep of event.nextSteps) {
    lines.push(`Next step: ${nextStep}`);
  }

  return lines.join("\n");
}
