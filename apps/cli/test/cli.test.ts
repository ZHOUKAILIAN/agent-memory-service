import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, "../package.json");

test("runCli prints available commands for help", async () => {
  const writes: string[] = [];

  const exitCode = await runCli(["help"], {
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /resolve|doctor|context|checkpoint|flush-outbox|agent-sessions|demo/);
  assert.match(writes.join(""), /demo codex-continuity/);
});

test("package exposes the documented agent-memory binary", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  assert.deepEqual(packageJson.bin, {
    "agent-memory": "src/index.ts"
  });
});
