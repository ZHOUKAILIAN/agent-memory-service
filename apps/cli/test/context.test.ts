import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("context reads the bound project and prints JSON", async () => {
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

  const writes: string[] = [];

  const exitCode = await runCli(["context"], {
    cwd: tempDir,
    apiClient: {
      getTaskContext: async () => ({
        project: {
          id: "prj_123",
          name: "demo-project",
          description: "Created by agent-memory CLI",
          repo_url: null
        },
        task: {
          id: "tsk_123",
          project_id: "prj_123",
          title: "demo-task",
          description: "Created by agent-memory CLI",
          source: "agent-memory-cli",
          external_ref: null
        },
        summary: {
          task_id: "tsk_123",
          summary: "",
          current_status: null,
          active_decisions: [],
          active_constraints: [],
          next_steps: [],
          updated_at: null
        },
        checkpoints: {
          recent: []
        },
        generated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /"tsk_123"/);
  assert.match(writes.join(""), /"demo-task"/);
});
