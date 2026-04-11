import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("resolve creates and stores a workspace binding", async () => {
  const writes: string[] = [];
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-"));

  const resolveProjectCalls: Array<{ name: string; description: string; repo_url?: string }> = [];
  const resolveTaskCalls: Array<{ project_id: string; title: string; description: string; source: string; external_ref?: string }> = [];

  const exitCode = await runCli(["resolve", "--name", "demo-task"], {
    cwd: tempDir,
    apiClient: {
      resolveProject: async (input) => {
        resolveProjectCalls.push(input);

        return {
          id: "prj_123",
          name: "demo-project",
          description: input.description,
          repo_url: input.repo_url ?? null,
          created_at: "2026-04-11T12:00:00.000Z",
          updated_at: "2026-04-11T12:00:00.000Z"
        };
      },
      resolveTask: async (input) => {
        resolveTaskCalls.push(input);

        return {
          id: "tsk_123",
          project_id: input.project_id,
          title: input.title,
          description: input.description,
          source: input.source,
          external_ref: input.external_ref ?? null,
          created_at: "2026-04-11T12:00:00.000Z",
          updated_at: "2026-04-11T12:00:00.000Z"
        };
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.equal(resolveProjectCalls.length, 1);
  assert.equal(resolveTaskCalls.length, 1);
  assert.match(writes.join(""), /prj_123/);
  assert.match(writes.join(""), /tsk_123/);

  const database = new DatabaseSync(path.join(tempDir, ".agent-memory", "bridge.sqlite"));
  const row = database
    .prepare(
      `
        select workspace_path, project_id, project_name, task_id, task_title
        from workspace_bindings
        where workspace_path = ?
      `
    )
    .get(tempDir) as {
      workspace_path: string;
      project_id: string;
      project_name: string;
      task_id: string;
      task_title: string;
    } | undefined;

  assert.deepEqual({ ...row }, {
    workspace_path: tempDir,
    project_id: "prj_123",
    project_name: "demo-project",
    task_id: "tsk_123",
    task_title: "demo-task"
  });
});
