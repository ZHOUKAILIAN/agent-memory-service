# CLI-First Memory Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal CLI-first bridge on top of the existing project-level API so we can validate the real sync loop before redesigning the server-side data model.

**Architecture:** Add a new `apps/cli` workspace package that talks to the existing HTTP API and stores local bindings/outbox in a workspace-scoped SQLite database. Keep the server API unchanged for this slice and map the current `project` concept to a task-like binding in the CLI so we can test `resolve -> context -> checkpoint -> flush-outbox` end to end.

**Tech Stack:** TypeScript, Node.js, built-in `node:sqlite`, built-in `node:test`, existing Fastify API, pnpm workspace

---

## Planned File Structure

- `apps/cli/package.json` for CLI dependencies and scripts
- `apps/cli/src/index.ts` for command entrypoint
- `apps/cli/src/cli.ts` for argument parsing and command routing
- `apps/cli/src/config.ts` for env and workspace config helpers
- `apps/cli/src/workspace.ts` for `.agent-memory` path helpers
- `apps/cli/src/storage/sqlite.ts` for local SQLite schema and persistence
- `apps/cli/src/http/client.ts` for API requests
- `apps/cli/src/commands/resolve.ts` for project binding resolution
- `apps/cli/src/commands/context.ts` for reading context
- `apps/cli/src/commands/checkpoint.ts` for writing conversations and memory blocks
- `apps/cli/src/commands/flush-outbox.ts` for retrying queued operations
- `apps/cli/test/resolve.test.ts` for resolve flow
- `apps/cli/test/context.test.ts` for context flow
- `apps/cli/test/checkpoint.test.ts` for checkpoint and outbox flow

### Task 1: Bootstrap The CLI Workspace

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/cli.ts`
- Test: `apps/cli/test/resolve.test.ts`

- [ ] **Step 1: Write the failing CLI smoke test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../src/cli.js";

test("runCli prints available commands for help", async () => {
  const writes: string[] = [];

  const exitCode = await runCli(["help"], {
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /resolve|context|checkpoint|flush-outbox/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/resolve.test.ts`
Expected: FAIL because `apps/cli` and `runCli` do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export async function runCli(argv: string[], io = defaultIo) {
  const command = argv[0] ?? "help";

  if (command === "help") {
    io.writeStdout("Commands: resolve, context, checkpoint, flush-outbox\n");
    return 0;
  }

  io.writeStderr(`Unknown command: ${command}\n`);
  return 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/resolve.test.ts`
Expected: PASS

### Task 2: Add Workspace SQLite Binding Storage

**Files:**
- Create: `apps/cli/src/workspace.ts`
- Create: `apps/cli/src/storage/sqlite.ts`
- Modify: `apps/cli/src/cli.ts`
- Test: `apps/cli/test/resolve.test.ts`

- [ ] **Step 1: Write the failing resolve test**

```ts
test("resolve creates and stores a workspace binding", async () => {
  const writes: string[] = [];
  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-memory-"));

  const exitCode = await runCli(["resolve", "--name", "demo-task"], {
    cwd: tempDir,
    apiClient: {
      createProject: async () => ({
        id: "prj_123",
        name: "demo-task",
        description: "Created by agent-memory CLI",
        repo_url: null
      })
    },
    writeStdout: (chunk) => writes.push(chunk),
    writeStderr: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /prj_123/);
  assert.deepEqual(readStoredBinding(tempDir), {
    projectId: "prj_123",
    workspacePath: tempDir
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/resolve.test.ts`
Expected: FAIL because `resolve` and SQLite persistence do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function ensureBridgeDatabase(workspacePath: string) {
  const database = new DatabaseSync(path.join(workspacePath, ".agent-memory", "bridge.sqlite"));
  database.exec(`
    create table if not exists workspace_bindings (
      workspace_path text primary key,
      project_id text not null,
      project_name text not null,
      created_at text not null,
      updated_at text not null
    );
  `);
  return database;
}
```

```ts
export async function resolveCommand(args, deps) {
  const binding = loadWorkspaceBinding(deps.cwd);
  if (binding) return printBinding(binding);

  const project = await deps.apiClient.createProject({
    name: args.name,
    description: args.description ?? "Created by agent-memory CLI"
  });

  saveWorkspaceBinding(deps.cwd, project);
  deps.writeStdout(`${project.id}\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/resolve.test.ts`
Expected: PASS

### Task 3: Add Context Read Command

**Files:**
- Create: `apps/cli/src/http/client.ts`
- Create: `apps/cli/src/commands/context.ts`
- Modify: `apps/cli/src/cli.ts`
- Test: `apps/cli/test/context.test.ts`

- [ ] **Step 1: Write the failing context test**

```ts
test("context reads the bound project and prints JSON", async () => {
  const writes: string[] = [];
  const tempDir = await setupBoundWorkspace("prj_123");

  const exitCode = await runCli(["context"], {
    cwd: tempDir,
    apiClient: {
      getContext: async () => ({
        project: { id: "prj_123", name: "demo-task", description: "demo" },
        memory: { background: [], constraints: [], decisions: [], todo: [], status: [] },
        conversation: { recent_entries: [] },
        generated_at: "2026-04-11T12:00:00.000Z"
      })
    },
    writeStdout: (chunk) => writes.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.match(writes.join(""), /"prj_123"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/context.test.ts`
Expected: FAIL because `context` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export async function contextCommand(_args, deps) {
  const binding = requireWorkspaceBinding(deps.cwd);
  const context = await deps.apiClient.getContext(binding.projectId);
  deps.writeStdout(`${JSON.stringify(context, null, 2)}\n`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/context.test.ts`
Expected: PASS

### Task 4: Add Checkpoint And Outbox Flow

**Files:**
- Create: `apps/cli/src/commands/checkpoint.ts`
- Create: `apps/cli/src/commands/flush-outbox.ts`
- Modify: `apps/cli/src/storage/sqlite.ts`
- Modify: `apps/cli/src/cli.ts`
- Test: `apps/cli/test/checkpoint.test.ts`

- [ ] **Step 1: Write the failing checkpoint test**

```ts
test("checkpoint writes conversation and memory blocks", async () => {
  const tempDir = await setupBoundWorkspace("prj_123");
  const calls: string[] = [];

  const exitCode = await runCli([
    "checkpoint",
    "--summary", "Validated callback URL on server",
    "--status", "in_progress",
    "--decision", "Only trust server-side callback validation",
    "--next-step", "Add redirect tests"
  ], {
    cwd: tempDir,
    apiClient: {
      createConversationEntry: async () => { calls.push("conversation"); },
      upsertMemoryBlock: async (input) => { calls.push(`memory:${input.block_type}`); }
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["conversation", "memory:status", "memory:decisions", "memory:todo"]);
});
```

- [ ] **Step 2: Write the failing offline outbox test**

```ts
test("checkpoint stores an outbox event when the API request fails", async () => {
  const tempDir = await setupBoundWorkspace("prj_123");

  const exitCode = await runCli([
    "checkpoint",
    "--summary", "Validated callback URL on server"
  ], {
    cwd: tempDir,
    apiClient: {
      createConversationEntry: async () => { throw new Error("network down"); }
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(countOutboxEvents(tempDir), 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/checkpoint.test.ts`
Expected: FAIL because `checkpoint` and outbox persistence do not exist yet.

- [ ] **Step 4: Write the minimal implementation**

```ts
export async function checkpointCommand(args, deps) {
  const binding = requireWorkspaceBinding(deps.cwd);
  const event = buildCheckpointEvent(args, binding.projectId);

  try {
    await sendCheckpoint(event, deps.apiClient);
    deps.writeStdout("checkpoint sent\n");
  } catch (error) {
    saveOutboxEvent(deps.cwd, event);
    deps.writeStdout("checkpoint queued\n");
  }

  return 0;
}
```

```ts
export async function flushOutboxCommand(_args, deps) {
  const events = listOutboxEvents(deps.cwd);

  for (const event of events) {
    await sendCheckpoint(event, deps.apiClient);
    deleteOutboxEvent(deps.cwd, event.id);
  }

  deps.writeStdout(`flushed ${events.length} event(s)\n`);
  return 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/checkpoint.test.ts`
Expected: PASS

### Task 5: Run Verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README-zh.md`

- [ ] **Step 1: Add workspace scripts**

```json
{
  "scripts": {
    "test": "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/*.test.ts && pnpm -C apps/api test",
    "cli:test": "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/*.test.ts"
  }
}
```

- [ ] **Step 2: Run focused verification**

Run: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node --test apps/cli/test/*.test.ts`
Expected: PASS

- [ ] **Step 3: Run existing API tests**

Run: `PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/vitest run apps/api/test/*.test.ts`
Expected: PASS

- [ ] **Step 4: Document the minimal CLI flow**

Add a short README section showing:
- `resolve`
- `context`
- `checkpoint`
- `flush-outbox`
