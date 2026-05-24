import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("doctor reports one bound task with two codex locators and no leaked token", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-doctor-e2e-"));

  const resolveExitCode = await runCli(["resolve", "--name", "demo-task"], {
    cwd: tempDir,
    apiClient: {
      resolveProject: async () => ({
        id: "prj_demo",
        name: "demo-project",
        description: "Created by agent-memory CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_demo",
        project_id: "prj_demo",
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
  assert.equal(resolveExitCode, 0);

  const firstExitCode = await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "codex-provider-a",
    "--provider", "provider-a",
    "--base-url", "https://api.first.example/v1?token=secret-a"
  ], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  assert.equal(firstExitCode, 0);

  await new Promise((resolve) => setTimeout(resolve, 10));

  const secondExitCode = await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "codex-provider-b",
    "--provider", "provider-b",
    "--base-url", "https://api.second.example/v1?token=secret-b"
  ], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  assert.equal(secondExitCode, 0);

  const writes: string[] = [];
  const exitCode = await runCli(["doctor"], {
    cwd: tempDir,
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://doctor.example/v1?token=doctor-secret"
    },
    writeStdout: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Workspace binding: present/);
  assert.match(output, /projectId: prj_demo/);
  assert.match(output, /taskId: tsk_demo/);
  assert.match(output, /Locator count: 2/);
  assert.match(output, /codex-provider-a/);
  assert.match(output, /codex-provider-b/);
  assert.match(output, /provider=provider-a/);
  assert.match(output, /provider=provider-b/);
  assert.match(output, /baseUrl=https:\/\/api\.first\.example/);
  assert.match(output, /baseUrl=https:\/\/api\.second\.example/);
  assert.match(output, /Base URL: https:\/\/doctor\.example/);
  assert.doesNotMatch(output, /token=secret/);
  assert.match(output, /does not upload transcripts/);
  assert.match(output, /Run: pnpm -C apps\/cli start discover all/);

  const jsonWrites: string[] = [];
  const jsonExitCode = await runCli(["doctor", "--json"], {
    cwd: tempDir,
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://doctor.example/v1?token=doctor-secret"
    },
    writeStdout: (chunk) => jsonWrites.push(chunk)
  });

  assert.equal(jsonExitCode, 0);
  const snapshot = JSON.parse(jsonWrites.join("")) as {
    binding: { projectId: string; taskId: string; exists: boolean };
    locators: { count: number; recent: Array<{ locator: string; providerLabel: string; baseUrlLabel: string }> };
    environment: { baseUrlLabel: string; bridgeExists: boolean };
  };

  assert.equal(snapshot.binding.exists, true);
  assert.equal(snapshot.binding.projectId, "prj_demo");
  assert.equal(snapshot.binding.taskId, "tsk_demo");
  assert.equal(snapshot.locators.count, 2);
  assert.deepEqual(snapshot.locators.recent.map((item) => item.locator).sort(), ["codex-provider-a", "codex-provider-b"]);
  assert.deepEqual(snapshot.locators.recent.map((item) => item.providerLabel).sort(), ["provider-a", "provider-b"]);
  assert.deepEqual(snapshot.locators.recent.map((item) => item.baseUrlLabel).sort(), [
    "https://api.first.example",
    "https://api.second.example"
  ]);
  assert.equal(snapshot.environment.baseUrlLabel, "https://doctor.example");
  assert.equal(snapshot.environment.bridgeExists, true);
});


test("doctor reports cross CLI coverage for codex gemini and claude locators", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-doctor-coverage-"));
  await runCli(["resolve", "--name", "coverage-task"], {
    cwd: tempDir,
    apiClient: {
      resolveProject: async () => ({ id: "prj_cov", name: "coverage-project", description: "Created by agent-memory CLI", repo_url: null, created_at: "2026-04-11T12:00:00.000Z", updated_at: "2026-04-11T12:00:00.000Z" }),
      resolveTask: async () => ({ id: "tsk_cov", project_id: "prj_cov", title: "coverage-task", description: "Created by agent-memory CLI", source: "agent-memory-cli", external_ref: null, created_at: "2026-04-11T12:00:00.000Z", updated_at: "2026-04-11T12:00:00.000Z" })
    },
    writeStdout: () => {}
  });

  for (const agentCli of ["codex", "gemini", "claude"]) {
    assert.equal(await runCli(["agent-sessions", "record", "--agent-cli", agentCli, "--locator", `${agentCli}-locator`], {
      cwd: tempDir,
      writeStdout: () => {},
      writeStderr: () => {}
    }), 0);
  }

  const writes: string[] = [];
  const exitCode = await runCli(["doctor"], { cwd: tempDir, writeStdout: (chunk) => writes.push(chunk) });
  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Cross-CLI coverage/);
  assert.match(output, /codex: 1/);
  assert.match(output, /gemini: 1/);
  assert.match(output, /claude: 1/);
});
