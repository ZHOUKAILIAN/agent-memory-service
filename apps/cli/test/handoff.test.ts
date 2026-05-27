import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";
import type { TaskContextBundle } from "../src/http/client.ts";

async function setupBoundWorkspace() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-"));

  await runCli(["resolve", "--name", "demo-task"], {
    cwd: tempDir,
    apiClient: {
      resolveProject: async () => ({
        id: "prj_123",
        name: "demo-project",
        description: "Created by agent-continuity CLI",
        repo_url: "https://github.com/example/demo.git",
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_123",
        project_id: "prj_123",
        title: "demo-task",
        description: "Created by agent-continuity CLI",
        source: "agent-continuity-cli",
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

function taskContext(): TaskContextBundle {
  return {
    project: {
      id: "prj_123",
      name: "demo-project",
      description: "Created by agent-continuity CLI",
      repo_url: "https://github.com/example/demo.git"
    },
    task: {
      id: "tsk_123",
      project_id: "prj_123",
      title: "demo-task",
      description: "Created by agent-continuity CLI",
      source: "agent-continuity-cli",
      external_ref: null
    },
    summary: {
      task_id: "tsk_123",
      summary: "Handoff ready",
      current_status: "Provider B finished discovery UX polish",
      active_decisions: ["Keep provider/base URL as metadata"],
      active_constraints: ["Do not import private transcripts"],
      next_steps: ["Continue implementation from provider A"],
      updated_at: "2026-04-11T12:05:00.000Z"
    },
    checkpoints: {
      recent: [{
        id: "chk_1",
        source: "provider-b",
        summary: "Finished discovery UX polish",
        current_status: "Ready for handoff",
        created_at: "2026-04-11T12:04:00.000Z"
      }]
    },
    generated_at: "2026-04-11T12:06:00.000Z"
  };
}

test("handoff create writes structured continuation context to the bound task", async () => {
  const tempDir = await setupBoundWorkspace();
  const checkpoints: Array<{ taskId: string; source: string; summary: string; content?: string; nextSteps: string[] }> = [];
  const writes: string[] = [];

  const exitCode = await runCli([
    "handoff",
    "create",
    "--from", "provider-b",
    "--to", "provider-a",
    "--summary", "Finished discovery UX polish",
    "--status", "Ready for handoff",
    "--decision", "Keep provider/base URL as metadata",
    "--constraint", "Do not import private transcripts",
    "--next-step", "Continue implementation from provider A"
  ], {
    cwd: tempDir,
    apiClient: {
      createTaskCheckpoint: async (taskId, input) => {
        checkpoints.push({
          taskId,
          source: input.source,
          summary: input.summary,
          content: input.content,
          nextSteps: input.next_steps
        });
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]?.taskId, "tsk_123");
  assert.equal(checkpoints[0]?.source, "provider-b");
  assert.equal(checkpoints[0]?.summary, "Finished discovery UX polish");
  assert.match(checkpoints[0]?.content ?? "", /# Agent handoff/);
  assert.match(checkpoints[0]?.content ?? "", /Safety boundary/);
  assert.deepEqual(checkpoints[0]?.nextSteps, ["Continue implementation from provider A"]);
  assert.match(writes.join(""), /Handoff checkpoint sent/);
  assert.match(writes.join(""), /taskId: tsk_123/);
});

test("handoff resume renders a continuation prompt from task context", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const exitCode = await runCli(["handoff", "resume"], {
    cwd: tempDir,
    apiClient: {
      getTaskContext: async () => taskContext()
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const output = writes.join("");
  assert.equal(exitCode, 0);
  assert.match(output, /# Continue this agent task/);
  assert.match(output, /Workspace:/);
  assert.match(output, /Task: demo-task \(tsk_123\)/);
  assert.match(output, /Provider B finished discovery UX polish/);
  assert.match(output, /Keep provider\/base URL as metadata/);
  assert.match(output, /Continue implementation from provider A/);
  assert.match(output, /not a raw transcript import/);
});

test("handoff resume --json returns stable structured payload", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const exitCode = await runCli(["handoff", "resume", "--json"], {
    cwd: tempDir,
    apiClient: {
      getTaskContext: async () => taskContext()
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const payload = JSON.parse(writes.join(""));
  assert.equal(exitCode, 0);
  assert.equal(payload.task.id, "tsk_123");
  assert.equal(payload.safety.transcriptImport, false);
  assert.deepEqual(payload.summary.next_steps, ["Continue implementation from provider A"]);
});


test("handoff create queues continuation context when delivery fails", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const queuedExitCode = await runCli([
    "handoff",
    "create",
    "--from", "provider-b",
    "--to", "provider-a",
    "--summary", "Finished discovery UX polish",
    "--status", "Ready for handoff",
    "--next-step", "Continue implementation from provider A"
  ], {
    cwd: tempDir,
    apiClient: {
      createTaskCheckpoint: async () => {
        throw new Error("network down");
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(queuedExitCode, 0);
  assert.equal(countOutboxEvents(tempDir), 1);
  assert.match(writes.join(""), /Handoff checkpoint queued/);

  const calls: string[] = [];
  const flushedExitCode = await runCli(["flush-outbox"], {
    cwd: tempDir,
    apiClient: {
      createTaskCheckpoint: async (taskId, input) => {
        calls.push(`${taskId}:${input.source}:${input.summary}:${input.next_steps.join(",")}`);
      }
    },
    writeStdout: () => {}
  });

  assert.equal(flushedExitCode, 0);
  assert.equal(countOutboxEvents(tempDir), 0);
  assert.deepEqual(calls, ["tsk_123:provider-b:Finished discovery UX polish:Continue implementation from provider A"]);
});
