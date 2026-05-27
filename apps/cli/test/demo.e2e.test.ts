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
        description: "Created by agent-continuity demo",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_demo",
        project_id: "prj_demo",
        title: "demo-task",
        description: "Created by agent-continuity demo",
        source: "agent-continuity-cli",
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
        description: "Created by agent-continuity demo",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_demo_json",
        project_id: "prj_demo_json",
        title: "demo-task-json",
        description: "Created by agent-continuity demo",
        source: "agent-continuity-cli",
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
    doctor: { locators: { count: number }; binding: { exists: boolean; projectId: string; taskId: string }; safety: { metadataOnly: boolean; readsExternalCliHome: boolean; uploadsTranscript: boolean } };
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
  assert.equal(payload.doctor.safety.readsExternalCliHome, false);
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
        description: "Created by agent-continuity CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_existing",
        project_id: "prj_existing",
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

test("demo handoff-continuity renders a provider handoff and resume prompt", async () => {
  const writes: string[] = [];
  const taskCheckpoints: Array<{ taskId: string; source: string; summary: string; current_status?: string; decisions: string[]; constraints: string[]; next_steps: string[] }> = [];

  const exitCode = await runCli(["demo", "handoff-continuity"], {
    apiClient: {
      resolveProject: async (input) => ({
        id: "prj_handoff_demo",
        name: input.name,
        description: input.description,
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async (input) => ({
        id: "tsk_handoff_demo",
        project_id: input.project_id,
        title: input.title,
        description: input.description,
        source: input.source,
        external_ref: input.external_ref ?? null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      createTaskCheckpoint: async (taskId, input) => {
        taskCheckpoints.unshift({ taskId, ...input });
      },
      getTaskContext: async (taskId) => {
        const latest = taskCheckpoints[0]!;
        return {
          project: {
            id: "prj_handoff_demo",
            name: "handoff-continuity-demo-project",
            description: "Created by agent-continuity demo",
            repo_url: null
          },
          task: {
            id: taskId,
            project_id: "prj_handoff_demo",
            title: "handoff-continuity-demo-task",
            description: "Created by agent-continuity demo",
            source: "agent-continuity-cli",
            external_ref: null
          },
          summary: {
            task_id: taskId,
            summary: latest.summary,
            current_status: latest.current_status ?? null,
            active_decisions: latest.decisions,
            active_constraints: latest.constraints,
            next_steps: latest.next_steps,
            updated_at: "2026-04-11T12:05:00.000Z"
          },
          checkpoints: {
            recent: [{
              id: "chk_handoff_demo",
              source: latest.source,
              summary: latest.summary,
              current_status: latest.current_status ?? null,
              created_at: "2026-04-11T12:05:00.000Z"
            }]
          },
          generated_at: "2026-04-11T12:06:00.000Z"
        };
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const output = writes.join("");
  assert.equal(exitCode, 0);
  assert.match(output, /Handoff continuity demo completed\./);
  assert.match(output, /Step 1: provider-b wrote a structured handoff checkpoint\./);
  assert.match(output, /Step 2: provider-a rendered a resume prompt/);
  assert.match(output, /# Continue this agent task/);
  assert.match(output, /Provider\/base URL remains source metadata/);
  assert.match(output, /Continue implementation from provider A/);
  assert.match(output, /not a raw transcript import/);
  assert.match(output, /Same project\/task: yes/);
  assert.match(output, /Structured context only: yes/);
});

test("demo handoff-continuity --json returns stable continuation payload", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-continuity-handoff-demo-json-"));
  const writes: string[] = [];
  const taskCheckpoints: Array<{ taskId: string; source: string; summary: string; current_status?: string; decisions: string[]; constraints: string[]; next_steps: string[] }> = [];

  const exitCode = await runCli(["demo", "handoff-continuity", "--workspace", tempDir, "--json"], {
    apiClient: {
      resolveProject: async (input) => ({
        id: "prj_handoff_json",
        name: input.name,
        description: input.description,
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async (input) => ({
        id: "tsk_handoff_json",
        project_id: input.project_id,
        title: input.title,
        description: input.description,
        source: input.source,
        external_ref: input.external_ref ?? null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      createTaskCheckpoint: async (taskId, input) => {
        taskCheckpoints.unshift({ taskId, ...input });
      },
      getTaskContext: async (taskId) => {
        const latest = taskCheckpoints[0]!;
        return {
          project: {
            id: "prj_handoff_json",
            name: "handoff-continuity-demo-project",
            description: "Created by agent-continuity demo",
            repo_url: null
          },
          task: {
            id: taskId,
            project_id: "prj_handoff_json",
            title: "handoff-continuity-demo-task",
            description: "Created by agent-continuity demo",
            source: "agent-continuity-cli",
            external_ref: null
          },
          summary: {
            task_id: taskId,
            summary: latest.summary,
            current_status: latest.current_status ?? null,
            active_decisions: latest.decisions,
            active_constraints: latest.constraints,
            next_steps: latest.next_steps,
            updated_at: "2026-04-11T12:05:00.000Z"
          },
          checkpoints: {
            recent: [{
              id: "chk_handoff_json",
              source: latest.source,
              summary: latest.summary,
              current_status: latest.current_status ?? null,
              created_at: "2026-04-11T12:05:00.000Z"
            }]
          },
          generated_at: "2026-04-11T12:06:00.000Z"
        };
      }
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(writes.join(""));
  assert.equal(payload.demo, "handoff-continuity");
  assert.equal(payload.workspace.path, tempDir);
  assert.equal(payload.binding.projectId, "prj_handoff_json");
  assert.equal(payload.binding.taskId, "tsk_handoff_json");
  assert.equal(payload.handoff.from, "provider-b");
  assert.equal(payload.handoff.to, "provider-a");
  assert.equal(payload.resume.context.task.id, "tsk_handoff_json");
  assert.equal(payload.checks.sameProjectTask, true);
  assert.equal(payload.checks.structuredContextOnly, true);
  assert.equal(payload.checks.hasSafetyBoundary, true);
});
