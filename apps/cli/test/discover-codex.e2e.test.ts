import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

async function createFakeCliHome(name: string, fileName: string, payload: Record<string, unknown>) {
  const home = await mkdtemp(path.join(tmpdir(), `agent-memory-fake-${name}-`));
  const sessionsDir = path.join(home, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(path.join(sessionsDir, fileName), JSON.stringify(payload));
  return home;
}

test("discover codex lists metadata-only candidates without transcript content", async () => {
  const codexHome = await createFakeCliHome("codex", "session-a.json", {
    sessionId: "codex-session-a",
    providerLabel: "provider-a",
    baseUrl: "https://api.first.example/v1?token=super-secret-token",
    model: "codex-test",
    message: "PRIVATE TRANSCRIPT SHOULD NOT APPEAR",
    content: "PRIVATE CONTENT SHOULD NOT APPEAR"
  });
  const writes: string[] = [];

  const exitCode = await runCli(["discover", "codex", "--codex-home", codexHome], {
    cwd: await mkdtemp(path.join(tmpdir(), "agent-memory-discover-workspace-")),
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  const output = writes.join("");
  assert.match(output, /Codex discovery/);
  assert.match(output, /codex-session-a/);
  assert.match(output, /metadata only/);
  assert.doesNotMatch(output, /super-secret-token/);
  assert.doesNotMatch(output, /PRIVATE TRANSCRIPT/);
  assert.doesNotMatch(output, /PRIVATE CONTENT/);
});

test("discover gemini and claude list metadata-only candidates via generic or aliased home flags", async () => {
  const geminiHome = await createFakeCliHome("gemini", "conversation.json", {
    conversationId: "gemini-conversation-a",
    provider: "google",
    model: "gemini-2.5-pro",
    query: "PRIVATE QUERY",
    token: "PRIVATE TOKEN"
  });
  const claudeHome = await createFakeCliHome("claude", "session.json", {
    id: "claude-session-a",
    providerLabel: "anthropic",
    model: "claude-sonnet",
    transcript: "PRIVATE TRANSCRIPT"
  });

  const geminiWrites: string[] = [];
  const geminiExitCode = await runCli(["discover", "gemini", "--home", geminiHome], {
    cwd: await mkdtemp(path.join(tmpdir(), "agent-memory-discover-gemini-")),
    writeStdout: (chunk) => geminiWrites.push(chunk),
    writeStderr: (chunk) => geminiWrites.push(chunk)
  });
  assert.equal(geminiExitCode, 0);
  assert.match(geminiWrites.join(""), /Gemini discovery/);
  assert.match(geminiWrites.join(""), /gemini-conversation-a/);
  assert.doesNotMatch(geminiWrites.join(""), /PRIVATE QUERY|PRIVATE TOKEN/);

  const claudeWrites: string[] = [];
  const claudeExitCode = await runCli(["discover", "claude", "--claude-home", claudeHome], {
    cwd: await mkdtemp(path.join(tmpdir(), "agent-memory-discover-claude-")),
    writeStdout: (chunk) => claudeWrites.push(chunk),
    writeStderr: (chunk) => claudeWrites.push(chunk)
  });
  assert.equal(claudeExitCode, 0);
  assert.match(claudeWrites.join(""), /Claude discovery/);
  assert.match(claudeWrites.join(""), /claude-session-a/);
  assert.doesNotMatch(claudeWrites.join(""), /PRIVATE TRANSCRIPT/);
});

test("discover codex records selected candidate onto current workspace binding", async () => {
  const codexHome = await createFakeCliHome("codex-record", "session-a.json", {
    sessionId: "codex-session-a",
    providerLabel: "provider-a",
    baseUrl: "https://api.first.example/v1?token=super-secret-token",
    model: "codex-test",
    message: "PRIVATE TRANSCRIPT SHOULD NOT APPEAR",
    content: "PRIVATE CONTENT SHOULD NOT APPEAR"
  });
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-memory-discover-bound-"));

  const resolveExitCode = await runCli(["resolve", "--workspace", workspace, "--name", "discover-task"], {
    apiClient: {
      resolveProject: async () => ({
        id: "prj_discover",
        name: "discover-project",
        description: "Created by agent-memory CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_discover",
        project_id: "prj_discover",
        title: "discover-task",
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

  const recordWrites: string[] = [];
  const recordExitCode = await runCli(["discover", "codex", "--codex-home", codexHome, "--record", "codex-1"], {
    cwd: workspace,
    writeStdout: (chunk) => recordWrites.push(chunk),
    writeStderr: (chunk) => recordWrites.push(chunk)
  });
  assert.equal(recordExitCode, 0);
  assert.match(recordWrites.join(""), /Recorded discovered Codex locator/);

  const listWrites: string[] = [];
  const listExitCode = await runCli(["agent-sessions", "list", "--json"], {
    cwd: workspace,
    writeStdout: (chunk) => listWrites.push(chunk)
  });
  assert.equal(listExitCode, 0);
  const records = JSON.parse(listWrites.join("")) as Array<{ locator: string; projectId: string; taskId: string; baseUrlLabel: string; metadata: Record<string, unknown> }>;
  assert.equal(records.length, 1);
  assert.equal(records[0]!.locator, "codex-session-a");
  assert.equal(records[0]!.projectId, "prj_discover");
  assert.equal(records[0]!.taskId, "tsk_discover");
  assert.equal(records[0]!.baseUrlLabel, "https://api.first.example");
  assert.equal(records[0]!.metadata.discovery, "codex");
  assert.doesNotMatch(JSON.stringify(records), /super-secret-token|PRIVATE TRANSCRIPT|PRIVATE CONTENT/);
});

test("discover gemini and claude record into current workspace binding without leaking sensitive content", async () => {
  const geminiHome = await createFakeCliHome("gemini-record", "session.json", {
    sessionId: "gemini-session-a",
    provider: "google",
    model: "gemini-2.5-pro",
    message: "PRIVATE MESSAGE",
    query: "PRIVATE QUERY"
  });
  const claudeHome = await createFakeCliHome("claude-record", "session.json", {
    conversationId: "claude-conversation-a",
    providerLabel: "anthropic",
    baseUrl: "https://claude.example/v1?token=secret",
    content: "PRIVATE CONTENT"
  });
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-memory-discover-multi-bound-"));

  const resolveExitCode = await runCli(["resolve", "--workspace", workspace, "--name", "discover-task"], {
    apiClient: {
      resolveProject: async () => ({
        id: "prj_multi",
        name: "discover-project",
        description: "Created by agent-memory CLI",
        repo_url: null,
        created_at: "2026-04-11T12:00:00.000Z",
        updated_at: "2026-04-11T12:00:00.000Z"
      }),
      resolveTask: async () => ({
        id: "tsk_multi",
        project_id: "prj_multi",
        title: "discover-task",
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

  assert.equal(await runCli(["discover", "gemini", "--gemini-home", geminiHome, "--record", "gemini-1"], {
    cwd: workspace,
    writeStdout: () => {},
    writeStderr: () => {}
  }), 0);

  assert.equal(await runCli(["discover", "claude", "--home", claudeHome, "--record", "claude-1"], {
    cwd: workspace,
    writeStdout: () => {},
    writeStderr: () => {}
  }), 0);

  const listWrites: string[] = [];
  const listExitCode = await runCli(["agent-sessions", "list", "--json"], {
    cwd: workspace,
    writeStdout: (chunk) => listWrites.push(chunk)
  });
  assert.equal(listExitCode, 0);
  const records = JSON.parse(listWrites.join("")) as Array<{ agentCli: string; locator: string; projectId: string; taskId: string; metadata: Record<string, unknown> }>;
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.agentCli).sort(), ["claude", "gemini"]);
  assert.deepEqual([...new Set(records.map((record) => record.projectId))], ["prj_multi"]);
  assert.deepEqual([...new Set(records.map((record) => record.taskId))], ["tsk_multi"]);
  assert.deepEqual(records.map((record) => record.metadata.discovery).sort(), ["claude", "gemini"]);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE MESSAGE|PRIVATE QUERY|PRIVATE CONTENT|token=secret/);

  const doctorWrites: string[] = [];
  const doctorExitCode = await runCli(["doctor"], {
    cwd: workspace,
    writeStdout: (chunk) => doctorWrites.push(chunk)
  });
  assert.equal(doctorExitCode, 0);
  assert.match(doctorWrites.join(""), /gemini-session-a/);
  assert.match(doctorWrites.join(""), /claude-conversation-a/);
});

test("discover record fails for gemini and claude when workspace is unresolved", async () => {
  const geminiHome = await createFakeCliHome("gemini-unbound", "session.json", { sessionId: "gemini-session-a" });
  const claudeHome = await createFakeCliHome("claude-unbound", "session.json", { sessionId: "claude-session-a" });

  const geminiWrites: string[] = [];
  const geminiExitCode = await runCli(["discover", "gemini", "--home", geminiHome, "--record", "gemini-1"], {
    cwd: await mkdtemp(path.join(tmpdir(), "agent-memory-unbound-gemini-")),
    writeStdout: (chunk) => geminiWrites.push(chunk),
    writeStderr: (chunk) => geminiWrites.push(chunk)
  });
  assert.equal(geminiExitCode, 1);
  assert.match(geminiWrites.join(""), /Run `agent-memory resolve` first/);

  const claudeWrites: string[] = [];
  const claudeExitCode = await runCli(["discover", "claude", "--claude-home", claudeHome, "--record", "claude-1"], {
    cwd: await mkdtemp(path.join(tmpdir(), "agent-memory-unbound-claude-")),
    writeStdout: (chunk) => claudeWrites.push(chunk),
    writeStderr: (chunk) => claudeWrites.push(chunk)
  });
  assert.equal(claudeExitCode, 1);
  assert.match(claudeWrites.join(""), /Run `agent-memory resolve` first/);
});
