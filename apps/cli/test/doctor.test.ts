import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

async function setupBoundWorkspace() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-doctor-"));

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

test("doctor shows resolve guidance for unbound workspace without creating bridge DB", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-doctor-unbound-"));
  const writes: string[] = [];

  const exitCode = await runCli(["doctor"], {
    cwd: tempDir,
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://api.example.com/v1?token=secret"
    },
    writeStdout: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Doctor summary/);
  assert.match(output, /Workspace binding: missing/);
  assert.match(output, /Locator count: 0/);
  assert.match(output, /Run: pnpm -C apps\/cli start resolve/);
  assert.match(output, /does not read private CLI transcripts/);
  assert.match(output, /Base URL: https:\/\/api\.example\.com/);
  assert.doesNotMatch(output, /token=secret/);
  assert.doesNotMatch(output, /Bridge DB: present/);

  const jsonWrites: string[] = [];
  const jsonExitCode = await runCli(["doctor", "--json"], {
    cwd: tempDir,
    env: {
      ...process.env,
      AGENT_MEMORY_BASE_URL: "https://api.example.com/v1?token=secret"
    },
    writeStdout: (chunk) => jsonWrites.push(chunk)
  });

  assert.equal(jsonExitCode, 0);
  const snapshot = JSON.parse(jsonWrites.join("")) as {
    environment: { bridgeExists: boolean; baseUrlLabel: string };
    binding: { exists: boolean };
    locators: { count: number; recent: unknown[] };
    safety: { metadataOnly: boolean; readsExternalCliHome: boolean; uploadsTranscript: boolean };
    nextSteps: string[];
  };

  assert.equal(snapshot.environment.bridgeExists, false);
  assert.equal(snapshot.environment.baseUrlLabel, "https://api.example.com");
  assert.equal(snapshot.binding.exists, false);
  assert.equal(snapshot.locators.count, 0);
  assert.deepEqual(snapshot.locators.recent, []);
  assert.equal(snapshot.safety.metadataOnly, true);
  assert.equal(snapshot.safety.readsExternalCliHome, false);
  assert.equal(snapshot.safety.uploadsTranscript, false);
  assert.match(snapshot.nextSteps[0] ?? "", /resolve/);
});

test("doctor shows binding and record guidance when workspace has no locators", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const exitCode = await runCli(["doctor"], {
    cwd: tempDir,
    writeStdout: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Workspace binding: present/);
  assert.match(output, /projectId: prj_123/);
  assert.match(output, /taskId: tsk_123/);
  assert.match(output, /Locator count: 0/);
  assert.match(output, /agent-sessions record/);
});
