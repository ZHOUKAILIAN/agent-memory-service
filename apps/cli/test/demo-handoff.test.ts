import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";
import { createDemoApiClient } from "./support/demo-api-client.ts";

test("demo handoff-continuity renders provider B to provider A resume flow", async () => {
  const writes: string[] = [];

  const exitCode = await runCli(["demo", "handoff-continuity"], {
    apiClient: createDemoApiClient(),
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const output = writes.join("");
  assert.equal(exitCode, 0);
  assert.match(output, /Handoff continuity demo completed/);
  assert.match(output, /provider-b wrote a structured handoff checkpoint/);
  assert.match(output, /provider-a can resume from AMS context/);
  assert.match(output, /# Resume for provider-a/);
  assert.match(output, /Same task: yes/);
  assert.match(output, /Structured context: yes/);
  assert.match(output, /Transcript import: no/);
  assert.match(output, /provider\/baseUrl B can hand off structured continuation context/);
});

test("demo handoff-continuity --json returns stable payload", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-handoff-demo-json-"));
  const writes: string[] = [];

  const exitCode = await runCli(["demo", "handoff-continuity", "--workspace", tempDir, "--json"], {
    apiClient: createDemoApiClient(),
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  const payload = JSON.parse(writes.join(""));
  assert.equal(exitCode, 0);
  assert.equal(payload.demo, "handoff-continuity");
  assert.equal(payload.workspace.path, tempDir);
  assert.equal(payload.workspace.temporary, false);
  assert.equal(payload.binding.projectId, "prj_demo");
  assert.equal(payload.binding.taskId, "tsk_demo");
  assert.equal(payload.handoff.from, "provider-b");
  assert.equal(payload.handoff.to, "provider-a");
  assert.equal(payload.resume.context.task.id, "tsk_demo");
  assert.equal(payload.checks.sameTask, true);
  assert.equal(payload.checks.structuredContext, true);
  assert.equal(payload.checks.transcriptImport, false);
  assert.equal(payload.checks.hasNextStep, true);
});
