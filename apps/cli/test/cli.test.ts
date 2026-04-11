import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli.ts";

test("runCli prints available commands for help", async () => {
  const writes: string[] = [];

  const exitCode = await runCli(["help"], {
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /resolve|context|checkpoint|flush-outbox/);
});
