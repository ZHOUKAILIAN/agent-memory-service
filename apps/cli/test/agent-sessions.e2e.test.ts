import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("codex dual provider/base URL locators stay bound to one workspace task", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-codex-e2e-"));

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

  const firstRecordWrites: string[] = [];
  const firstExitCode = await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "codex-provider-a",
    "--provider", "provider-a",
    "--base-url", "https://api.first.example/v1?token=secret-a"
  ], {
    cwd: tempDir,
    writeStdout: (chunk) => firstRecordWrites.push(chunk),
    writeStderr: (chunk) => firstRecordWrites.push(chunk)
  });
  assert.equal(firstExitCode, 0);

  const secondRecordWrites: string[] = [];
  const secondExitCode = await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "codex-provider-b",
    "--provider", "provider-b",
    "--base-url", "https://api.second.example/v1?token=secret-b"
  ], {
    cwd: tempDir,
    writeStdout: (chunk) => secondRecordWrites.push(chunk),
    writeStderr: (chunk) => secondRecordWrites.push(chunk)
  });
  assert.equal(secondExitCode, 0);

  const listWrites: string[] = [];
  const listExitCode = await runCli(["agent-sessions", "list"], {
    cwd: tempDir,
    writeStdout: (chunk) => listWrites.push(chunk)
  });

  assert.equal(listExitCode, 0);
  const listOutput = listWrites.join("");
  assert.match(listOutput, /Locator count: 2/);
  assert.match(listOutput, /codex-provider-a/);
  assert.match(listOutput, /codex-provider-b/);
  assert.match(listOutput, /projectId=prj_demo/);
  assert.match(listOutput, /taskId=tsk_demo/);
  assert.match(listOutput, /provider=provider-a/);
  assert.match(listOutput, /provider=provider-b/);
  assert.match(listOutput, /baseUrl=https:\/\/api\.first\.example/);
  assert.match(listOutput, /baseUrl=https:\/\/api\.second\.example/);
  assert.doesNotMatch(listOutput, /token=secret/);
  assert.match(firstRecordWrites.join(""), /metadata only; no transcript or private CLI content stored\./);
  assert.match(secondRecordWrites.join(""), /metadata only; no transcript or private CLI content stored\./);

  const jsonWrites: string[] = [];
  const jsonExitCode = await runCli(["agent-sessions", "list", "--json"], {
    cwd: tempDir,
    writeStdout: (chunk) => jsonWrites.push(chunk)
  });

  assert.equal(jsonExitCode, 0);
  const records = JSON.parse(jsonWrites.join("")) as Array<{
    locator: string;
    projectId: string;
    taskId: string;
    providerLabel: string;
    baseUrlLabel: string;
    baseUrlHash: string;
  }>;
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.locator).sort(), ["codex-provider-a", "codex-provider-b"]);
  assert.deepEqual([...new Set(records.map((record) => record.projectId))], ["prj_demo"]);
  assert.deepEqual([...new Set(records.map((record) => record.taskId))], ["tsk_demo"]);
  assert.deepEqual([...new Set(records.map((record) => record.providerLabel))].sort(), ["provider-a", "provider-b"]);
  assert.deepEqual([...new Set(records.map((record) => record.baseUrlLabel))].sort(), [
    "https://api.first.example",
    "https://api.second.example"
  ]);
  for (const record of records) {
    assert.notEqual(record.baseUrlHash, record.baseUrlLabel);
  }
});
