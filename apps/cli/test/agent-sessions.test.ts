import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runCli } from "../src/cli.ts";

async function setupBoundWorkspace() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-agent-sessions-"));

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

function openDatabase(cwd: string) {
  return new DatabaseSync(path.join(cwd, ".agent-memory", "bridge.sqlite"));
}

test("agent-sessions record stores locator metadata and returns JSON", async () => {
  const tempDir = await setupBoundWorkspace();
  const writes: string[] = [];

  const exitCode = await runCli([
    "agent-sessions",
    "record",
    "--agent-cli", "codex",
    "--locator", "session-1",
    "--session-path", "/tmp/codex/session-1.json",
    "--provider", "openai-compatible",
    "--base-url", "https://api.example.com/v1?token=secret",
    "--task-key", "AMS-002"
  ], {
    cwd: tempDir,
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = JSON.parse(writes.join("")) as {
    agentCli: string;
    locator: string;
    baseUrlLabel: string;
    baseUrlHash: string;
    taskId: string;
    taskKey: string;
  };

  assert.equal(output.agentCli, "codex");
  assert.equal(output.locator, "session-1");
  assert.equal(output.baseUrlLabel, "https://api.example.com");
  assert.equal(output.taskId, "tsk_123");
  assert.equal(output.taskKey, "AMS-002");
  assert.notEqual(output.baseUrlHash, "https://api.example.com/v1?token=secret");

  const database = openDatabase(tempDir);
  const row = database.prepare(`
    select project_id, task_id, base_url_label, base_url_hash
    from agent_session_locators
    where workspace_path = ? and agent_cli = ? and locator = ?
  `).get(tempDir, "codex", "session-1") as {
    project_id: string;
    task_id: string;
    base_url_label: string;
    base_url_hash: string;
  };
  database.close();

  assert.equal(row.project_id, "prj_123");
  assert.equal(row.task_id, "tsk_123");
  assert.equal(row.base_url_label, "https://api.example.com");
  assert.notEqual(row.base_url_hash, "https://api.example.com/v1?token=secret");
});

test("agent-sessions list returns records ordered by updated_at desc", async () => {
  const tempDir = await setupBoundWorkspace();

  await runCli(["agent-sessions", "record", "--agent-cli", "codex", "--locator", "older"], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  await runCli(["agent-sessions", "record", "--agent-cli", "gemini", "--locator", "newer"], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  const writes: string[] = [];
  const exitCode = await runCli(["agent-sessions", "list"], {
    cwd: tempDir,
    writeStdout: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = JSON.parse(writes.join("")) as Array<{ locator: string }>;
  assert.deepEqual(output.map((item) => item.locator), ["newer", "older"]);
});

test("agent-sessions record fails without existing workspace binding", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-agent-sessions-unbound-"));
  const writes: string[] = [];

  const exitCode = await runCli(["agent-sessions", "record", "--agent-cli", "codex", "--locator", "session-1"], {
    cwd: tempDir,
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 1);
  assert.match(writes.join(""), /Run `agent-memory resolve` first/);
});

test("agent-sessions keeps same workspace binding when codex provider or base URL changes", async () => {
  const tempDir = await setupBoundWorkspace();

  await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "session-a",
    "--provider", "provider-a",
    "--base-url", "https://api.first.example/v1?secret=1"
  ], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "session-b",
    "--provider", "provider-b",
    "--base-url", "https://api.second.example/v1?secret=2"
  ], {
    cwd: tempDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  const database = openDatabase(tempDir);
  const rows = database.prepare(`
    select workspace_path, project_id, task_id, provider_label, base_url_label, base_url_hash
    from agent_session_locators
    order by locator asc
  `).all() as Array<{
    workspace_path: string;
    project_id: string;
    task_id: string;
    provider_label: string;
    base_url_label: string;
    base_url_hash: string;
  }>;
  database.close();

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => ({
    workspace_path: row.workspace_path,
    project_id: row.project_id,
    task_id: row.task_id
  })), [
    { workspace_path: tempDir, project_id: "prj_123", task_id: "tsk_123" },
    { workspace_path: tempDir, project_id: "prj_123", task_id: "tsk_123" }
  ]);
  assert.equal(rows[0]?.provider_label, "provider-a");
  assert.equal(rows[1]?.provider_label, "provider-b");
  assert.equal(rows[0]?.base_url_label, "https://api.first.example");
  assert.equal(rows[1]?.base_url_label, "https://api.second.example");
  assert.notEqual(rows[0]?.base_url_hash, "https://api.first.example/v1?secret=1");
  assert.notEqual(rows[1]?.base_url_hash, "https://api.second.example/v1?secret=2");
});

test("agent-sessions re-record updates existing locator instead of inserting duplicate", async () => {
  const tempDir = await setupBoundWorkspace();

  const firstWrites: string[] = [];
  await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "session-1",
    "--provider", "provider-a"
  ], {
    cwd: tempDir,
    writeStdout: (chunk) => firstWrites.push(chunk),
    writeStderr: () => {}
  });
  const firstRecord = JSON.parse(firstWrites.join("")) as { id: string; updatedAt: string; providerLabel: string };

  await new Promise((resolve) => setTimeout(resolve, 10));

  const secondWrites: string[] = [];
  await runCli([
    "agent-sessions", "record",
    "--agent-cli", "codex",
    "--locator", "session-1",
    "--provider", "provider-b"
  ], {
    cwd: tempDir,
    writeStdout: (chunk) => secondWrites.push(chunk),
    writeStderr: () => {}
  });
  const secondRecord = JSON.parse(secondWrites.join("")) as { id: string; updatedAt: string; providerLabel: string };

  assert.equal(secondRecord.id, firstRecord.id);
  assert.equal(secondRecord.providerLabel, "provider-b");
  assert.notEqual(secondRecord.updatedAt, firstRecord.updatedAt);

  const database = openDatabase(tempDir);
  const row = database.prepare(`
    select count(*) as count
    from agent_session_locators
    where workspace_path = ? and agent_cli = ? and locator = ?
  `).get(tempDir, "codex", "session-1") as { count: number };
  database.close();

  assert.equal(row.count, 1);
});

test("agent-sessions respects --workspace when launched from another directory", async () => {
  const tempDir = await setupBoundWorkspace();
  const launcherDir = await mkdtemp(path.join(tmpdir(), "agent-memory-agent-sessions-launcher-"));

  const exitCode = await runCli([
    "agent-sessions", "record",
    "--workspace", tempDir,
    "--agent-cli", "claude",
    "--locator", "session-target"
  ], {
    cwd: launcherDir,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);

  const database = openDatabase(tempDir);
  const row = database.prepare(`
    select workspace_path, agent_cli, locator
    from agent_session_locators
    where workspace_path = ? and agent_cli = ? and locator = ?
  `).get(tempDir, "claude", "session-target") as {
    workspace_path: string;
    agent_cli: string;
    locator: string;
  };
  database.close();

  assert.deepEqual({ ...row }, {
    workspace_path: tempDir,
    agent_cli: "claude",
    locator: "session-target"
  });
});
