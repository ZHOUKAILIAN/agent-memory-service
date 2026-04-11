import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runCli } from "../src/cli.ts";

async function setupBoundWorkspace() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-"));

  await runCli(["resolve", "--name", "demo-task"], {
    cwd: tempDir,
    apiClient: {
      resolveProject: async () => ({
        id: "prj_123",
        name: "demo-project",
        description: "Created by agent-memory CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_123",
        project_id: "prj_123",
        title: "demo-task",
        description: "Created by agent-memory CLI",
        source: "agent-memory-cli",
        external_ref: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    writeStdout: () => {}
  });

  return tempDir;
}

function countOutboxEvents(cwd: string) {
  const database = new DatabaseSync(path.join(cwd, ".agent-memory", "bridge.sqlite"));
  const row = database
    .prepare("select count(*) as count from outbox_events")
    .get() as { count: number };
  database.close();
  return row.count;
}

test("checkpoint writes memory blocks first and conversation last", async () => {
  const tempDir = await setupBoundWorkspace();
  const checkpoints: Array<{ taskId: string; summary: string; current_status?: string }> = [];

  const exitCode = await runCli(
    [
      "checkpoint",
      "--summary", "Validated callback URL on server",
      "--status", "in_progress",
      "--decision", "Only trust server-side callback validation",
      "--next-step", "Add redirect tests"
    ],
    {
      cwd: tempDir,
      apiClient: {
        createTaskCheckpoint: async (taskId, input) => {
          checkpoints.push({
            taskId,
            summary: input.summary,
            current_status: input.current_status
          });
        }
      },
      writeStdout: () => {}
    }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(checkpoints, [{
    taskId: "tsk_123",
    summary: "Validated callback URL on server",
    current_status: "in_progress"
  }]);
});

test("checkpoint queues an outbox event when sending fails and flush-outbox retries it", async () => {
  const tempDir = await setupBoundWorkspace();
  const calls: string[] = [];

  const queuedExitCode = await runCli(
    [
      "checkpoint",
      "--summary", "Validated callback URL on server",
      "--status", "in_progress",
      "--decision", "Only trust server-side callback validation"
    ],
    {
      cwd: tempDir,
      apiClient: {
        createTaskCheckpoint: async () => {
          throw new Error("network down");
        }
      },
      writeStdout: () => {}
    }
  );

  assert.equal(queuedExitCode, 0);
  assert.equal(countOutboxEvents(tempDir), 1);

  const flushedExitCode = await runCli(["flush-outbox"], {
    cwd: tempDir,
    apiClient: {
      createTaskCheckpoint: async (taskId, input) => {
        calls.push(`${taskId}:checkpoint:${input.summary}`);
      }
    },
    writeStdout: () => {}
  });

  assert.equal(flushedExitCode, 0);
  assert.equal(countOutboxEvents(tempDir), 0);
  assert.match(calls[calls.length - 1] ?? "", /tsk_123:checkpoint:Validated callback URL on server/);
});
