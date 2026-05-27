import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
        description: "Created by agent-continuity CLI",
        repo_url: null,
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

function cachePath(cwd: string) {
  return path.join(cwd, ".agent-memory", "cache", "continuation-latest.json");
}

test("baseurl switch records first base URL and writes continuation cache", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const exitCode = await runCli([
    "baseurl", "switch",
    "--agent-cli", "codex",
    "--provider", "provider-a",
    "--base-url", "https://api.first.example/v1?token=fake-secret"
  ], {
    cwd: tempDir,
    apiClient: {
      getTaskContext: async () => ({
        project: { id: "prj_123", name: "demo-project", description: "", repo_url: null },
        task: { id: "tsk_123", project_id: "prj_123", title: "demo-task", description: "", source: "agent-continuity-cli", external_ref: null },
        summary: {
          task_id: "tsk_123",
          summary: "Ready",
          current_status: "Working",
          active_decisions: ["Use metadata-only cache"],
          active_constraints: ["No transcript import"],
          next_steps: ["Switch provider"],
          updated_at: "2026-04-11T12:00:00.000Z"
        },
        checkpoints: { recent: [] },
        generated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const output = writes.join("");
  assert.equal(exitCode, 0);
  assert.match(output, /Base URL recorded/);
  assert.match(output, /currentBaseUrl: https:\/\/api\.first\.example/);
  assert.match(output, /preservedContext: yes/);
  assert.doesNotMatch(output, /token=fake-secret/);
  assert.equal(existsSync(cachePath(tempDir)), true);

  const cache = JSON.parse(readFileSync(cachePath(tempDir), "utf8"));
  assert.equal(cache.changed, false);
  assert.equal(cache.baseUrlLabel, "https://api.first.example");
  assert.equal(cache.safety.transcriptImport, false);
  assert.deepEqual(cache.continuation.nextSteps, ["Switch provider"]);
  assert.doesNotMatch(JSON.stringify(cache), /token=fake-secret/);
});

test("baseurl switch detects changed base URL and preserves context", async () => {
  const tempDir = await setupBoundWorkspace();

  await runCli([
    "baseurl", "switch",
    "--agent-cli", "codex",
    "--provider", "provider-a",
    "--base-url", "https://api.first.example/v1"
  ], {
    cwd: tempDir,
    apiClient: { getTaskContext: async () => ({
      project: { id: "prj_123", name: "demo-project", description: "", repo_url: null },
      task: { id: "tsk_123", project_id: "prj_123", title: "demo-task", description: "", source: "agent-continuity-cli", external_ref: null },
      summary: { task_id: "tsk_123", summary: "", current_status: null, active_decisions: [], active_constraints: [], next_steps: [], updated_at: null },
      checkpoints: { recent: [] },
      generated_at: "2026-04-11T12:00:00.000Z"
    }) },
    writeStdout: () => {}
  });

  const writes: string[] = [];
  const exitCode = await runCli([
    "baseurl", "switch",
    "--agent-cli", "codex",
    "--provider", "provider-b",
    "--base-url", "https://api.second.example/v1?token=fake-secret-b",
    "--yes",
    "--json"
  ], {
    cwd: tempDir,
    apiClient: {
      getTaskContext: async () => ({
        project: { id: "prj_123", name: "demo-project", description: "", repo_url: null },
        task: { id: "tsk_123", project_id: "prj_123", title: "demo-task", description: "", source: "agent-continuity-cli", external_ref: null },
        summary: {
          task_id: "tsk_123",
          summary: "Continue from provider A",
          current_status: "Ready for provider B",
          active_decisions: ["Keep task identity stable"],
          active_constraints: ["Metadata only"],
          next_steps: ["Resume on provider B"],
          updated_at: "2026-04-11T12:00:00.000Z"
        },
        checkpoints: { recent: [] },
        generated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const cache = JSON.parse(writes.join(""));
  assert.equal(exitCode, 0);
  assert.equal(cache.changed, true);
  assert.equal(cache.preserved, true);
  assert.equal(cache.previousBaseUrlLabel, "https://api.first.example");
  assert.equal(cache.baseUrlLabel, "https://api.second.example");
  assert.deepEqual(cache.continuation.nextSteps, ["Resume on provider B"]);
  assert.equal(cache.safety.transcriptImport, false);
  assert.doesNotMatch(JSON.stringify(cache), /token=fake-secret/);
});
