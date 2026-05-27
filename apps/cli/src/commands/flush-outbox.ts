import type { ApiClient } from "../http/client.ts";
import { deleteOutboxEvent, listOutboxEvents } from "../storage/sqlite.ts";

import { sendTaskCheckpointEvent } from "./checkpoint.ts";

type TaskCheckpointEvent = Parameters<typeof sendTaskCheckpointEvent>[0];

export async function flushOutboxCommand(
  _args: Map<string, string[]>,
  input: {
    apiClient: ApiClient;
    cwd: string;
    writeStdout: (chunk: string) => void;
    writeStderr: (chunk: string) => void;
  }
) {
  const events = listOutboxEvents<TaskCheckpointEvent>(input.cwd);
  let flushedCount = 0;
  let failedCount = 0;

  for (const event of events) {
    try {
      if (event.eventType === "task-checkpoint") {
        await sendTaskCheckpointEvent(event.payload, input.apiClient);
        deleteOutboxEvent(input.cwd, event.id);
        flushedCount += 1;
        continue;
      }

      input.writeStderr(`Unsupported outbox event type: ${event.eventType}\n`);
      failedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  input.writeStdout(`flushed ${flushedCount} event(s), failed ${failedCount} event(s)\n`);
  return failedCount === 0 ? 0 : 1;
}
