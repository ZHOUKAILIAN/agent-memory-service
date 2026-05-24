import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

async function createFakeCodexHome() {
  const codexHome = await mkdtemp(path.join(tmpdir(), "agent-memory-fake-codex-"));
  const sessionsDir = path.join(codexHome, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(path.join(sessionsDir, "session-a.json"), JSON.stringify({
    sessionId: "codex-session-a",
    providerLabel: "provider-a",
    baseUrl: "https://api.first.example/v1?token=super-secret-token",
    model: "codex-test",
    message: "PRIVATE TRANSCRIPT SHOULD NOT APPEAR",
    content: "PRIVATE CONTENT SHOULD NOT APPEAR"
  }));
  return codexHome;
}

test("discover codex lists metadata-only candidates without transcript content", async () => {
  const codexHome = await createFakeCodexHome();
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

test("discover codex records selected candidate onto current workspace binding", async () => {
  const codexHome = await createFakeCodexHome();
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
