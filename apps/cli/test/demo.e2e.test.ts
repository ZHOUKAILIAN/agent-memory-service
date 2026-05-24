import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("demo codex-continuity records two sanitized locators on one binding", async () => {
  const writes: string[] = [];

  const exitCode = await runCli(["demo", "codex-continuity"], {
    apiClient: {
      resolveProject: async () => ({
        id: "prj_demo",
        name: "demo-project",
        description: "Created by agent-memory demo",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_demo",
        project_id: "prj_demo",
        title: "demo-task",
        description: "Created by agent-memory demo",
        source: "agent-memory-cli",
        external_ref: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://doctor.example/v1?token=fake-doctor-secret"
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Codex continuity demo completed\./);
  assert.match(output, /projectId: prj_demo/);
  assert.match(output, /taskId: tsk_demo/);
  assert.match(output, /codex-provider-a/);
  assert.match(output, /codex-provider-b/);
  assert.match(output, /provider: provider-a/);
  assert.match(output, /provider: provider-b/);
  assert.match(output, /baseUrl: https:\/\/api\.first\.example/);
  assert.match(output, /baseUrl: https:\/\/api\.second\.example/);
  assert.match(output, /Doctor locator count: 2/);
  assert.match(output, /Same project\/task: yes/);
  assert.match(output, /Query token redacted: yes/);
  assert.doesNotMatch(output, /token=fake-/);
});

test("demo codex-continuity --json returns stable sanitized payload", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-demo-json-"));
  const writes: string[] = [];

  const exitCode = await runCli(["demo", "codex-continuity", "--workspace", tempDir, "--json"], {
    apiClient: {
      resolveProject: async () => ({
        id: "prj_demo_json",
        name: "demo-project-json",
        description: "Created by agent-memory demo",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_demo_json",
        project_id: "prj_demo_json",
        title: "demo-task-json",
        description: "Created by agent-memory demo",
        source: "agent-memory-cli",
        external_ref: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://doctor.example/v1?token=fake-doctor-secret"
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(writes.join("")) as {
    demo: string;
    workspace: { path: string; temporary: boolean };
    binding: { projectId: string; taskId: string; projectName: string; taskTitle: string };
    locators: Array<{ locator: string; providerLabel: string; baseUrlLabel: string; baseUrlHash: string }>;
    doctor: { locators: { count: number }; binding: { exists: boolean; projectId: string; taskId: string }; safety: { metadataOnly: boolean; readsPrivateCodexHome: boolean; uploadsTranscript: boolean } };
    checks: { sameProjectTask: boolean; queryTokenRedacted: boolean };
  };

  assert.equal(payload.demo, "codex-continuity");
  assert.equal(payload.workspace.path, tempDir);
  assert.equal(payload.workspace.temporary, false);
  assert.equal(payload.binding.projectId, "prj_demo_json");
  assert.equal(payload.binding.taskId, "tsk_demo_json");
  assert.equal(payload.doctor.binding.exists, true);
  assert.equal(payload.doctor.binding.projectId, "prj_demo_json");
  assert.equal(payload.doctor.binding.taskId, "tsk_demo_json");
  assert.equal(payload.doctor.locators.count, 2);
  assert.equal(payload.checks.sameProjectTask, true);
  assert.equal(payload.checks.queryTokenRedacted, true);
  assert.equal(payload.doctor.safety.metadataOnly, true);
  assert.equal(payload.doctor.safety.readsPrivateCodexHome, false);
  assert.equal(payload.doctor.safety.uploadsTranscript, false);
  assert.deepEqual(payload.locators.map((item) => item.locator).sort(), ["codex-provider-a", "codex-provider-b"]);
  assert.deepEqual(payload.locators.map((item) => item.providerLabel).sort(), ["provider-a", "provider-b"]);
  assert.deepEqual(payload.locators.map((item) => item.baseUrlLabel).sort(), [
    "https://api.first.example",
    "https://api.second.example"
  ]);
  assert.ok(payload.locators.every((item) => item.baseUrlHash && item.baseUrlHash !== item.baseUrlLabel));
  assert.doesNotMatch(JSON.stringify(payload), /token=fake-/);
});

test("demo codex-continuity rejects pre-bound workspace", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-demo-dirty-"));

  const firstExitCode = await runCli(["resolve", "--workspace", tempDir, "--name", "demo-task"], {
    apiClient: {
      resolveProject: async () => ({
        id: "prj_existing",
        name: "demo-project",
        description: "Created by agent-memory CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_existing",
        project_id: "prj_existing",
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
  assert.equal(firstExitCode, 0);

  const writes: string[] = [];
  const exitCode = await runCli(["demo", "codex-continuity", "--workspace", tempDir], {
    apiClient: {
      resolveProject: async () => {
        throw new Error("should not be called");
      },
      resolveTask: async () => {
        throw new Error("should not be called");
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 1);
  assert.match(writes.join(""), /Demo workspace must be empty/);
});
