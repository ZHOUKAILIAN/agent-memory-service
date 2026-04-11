# Project Memory Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working API service for shared project memory, including project creation, conversation ingestion, structured memory storage, and context bundle assembly.

**Architecture:** Use a single TypeScript API service with Fastify for transport, Zod for validation, a repository layer for PostgreSQL access, and a deterministic context assembly service. Keep the initial codebase small and modular so the service can ship before introducing SDKs, vector retrieval, or worker infrastructure.

**Tech Stack:** TypeScript, Node.js, Fastify, PostgreSQL, Zod, Vitest, tsx, pnpm

---

## Planned File Structure

- `package.json` for workspace scripts and shared tooling
- `tsconfig.json` for TypeScript compilation settings
- `apps/api/package.json` for API service dependencies
- `apps/api/src/server.ts` for process startup
- `apps/api/src/app.ts` for Fastify app construction
- `apps/api/src/routes/health.ts` for health route registration
- `apps/api/src/routes/projects.ts` for project and memory endpoints
- `apps/api/src/modules/projects/project-schema.ts` for project request validation
- `apps/api/src/modules/projects/project-repository.ts` for project persistence
- `apps/api/src/modules/conversations/conversation-schema.ts` for conversation validation
- `apps/api/src/modules/conversations/conversation-repository.ts` for conversation persistence
- `apps/api/src/modules/memory/memory-schema.ts` for memory block validation
- `apps/api/src/modules/memory/memory-repository.ts` for memory block persistence
- `apps/api/src/modules/context/context-service.ts` for context assembly rules
- `apps/api/src/db/client.ts` for PostgreSQL client setup
- `apps/api/src/db/migrations/001_init.sql` for base schema
- `apps/api/test/health.test.ts` for service smoke tests
- `apps/api/test/projects.test.ts` for project endpoint tests
- `apps/api/test/conversations.test.ts` for conversation ingestion tests
- `apps/api/test/memory.test.ts` for memory block tests
- `apps/api/test/context.test.ts` for context bundle tests

### Task 1: Bootstrap The API Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/routes/health.ts`
- Test: `apps/api/test/health.test.ts`

- [ ] **Step 1: Write the failing health test**

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/health.test.ts`
Expected: FAIL with module resolution or missing `buildApp` errors because the API scaffold does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function registerHealthRoutes(app) {
  app.get("/health", async () => {
    return { status: "ok" };
  });
}
```

```ts
import Fastify from "fastify";
import { registerHealthRoutes } from "./routes/health";

export function buildApp() {
  const app = Fastify();

  registerHealthRoutes(app);

  return app;
}
```

```ts
import { buildApp } from "./app";

const app = buildApp();

app.listen({ host: "0.0.0.0", port: 3000 }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/health.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json apps/api/package.json apps/api/src/app.ts apps/api/src/server.ts apps/api/src/routes/health.ts apps/api/test/health.test.ts
git commit -m "chore: bootstrap api workspace"
```

### Task 2: Add Project Creation Endpoint

**Files:**
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/projects.ts`
- Create: `apps/api/src/modules/projects/project-schema.ts`
- Create: `apps/api/src/modules/projects/project-repository.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/migrations/001_init.sql`
- Test: `apps/api/test/projects.test.ts`

- [ ] **Step 1: Write the failing project creation test**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";

describe("POST /projects", () => {
  it("creates a project", async () => {
    const createProject = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "payments-migration",
      description: "shared context",
      repo_url: "https://github.com/acme/payments",
      created_at: "2026-04-11T01:00:00.000Z"
    });

    const app = buildApp({
      projectRepository: { createProject }
    });

    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        name: "payments-migration",
        description: "shared context",
        repo_url: "https://github.com/acme/payments"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createProject).toHaveBeenCalledOnce();
    expect(response.json().project.id).toBe("prj_123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/projects.test.ts`
Expected: FAIL because `buildApp` does not yet accept dependencies and `/projects` is not registered.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  repo_url: z.string().url().optional()
});
```

```ts
import { createProjectSchema } from "../modules/projects/project-schema";

export function registerProjectRoutes(app, { projectRepository }) {
  app.post("/projects", async (request, reply) => {
    const payload = createProjectSchema.parse(request.body);
    const project = await projectRepository.createProject(payload);
    return reply.code(201).send({ project });
  });
}
```

```ts
import Fastify from "fastify";

export function buildApp(dependencies) {
  const app = Fastify();

  app.get("/health", async () => ({ status: "ok" }));
  registerProjectRoutes(app, dependencies);

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/projects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/projects.ts apps/api/src/modules/projects/project-schema.ts apps/api/src/modules/projects/project-repository.ts apps/api/src/db/client.ts apps/api/src/db/migrations/001_init.sql apps/api/test/projects.test.ts
git commit -m "feat: add project creation endpoint"
```

### Task 3: Add Conversation Ingestion

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Create: `apps/api/src/modules/conversations/conversation-schema.ts`
- Create: `apps/api/src/modules/conversations/conversation-repository.ts`
- Test: `apps/api/test/conversations.test.ts`

- [ ] **Step 1: Write the failing conversation ingestion test**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";

describe("POST /projects/:id/conversations", () => {
  it("stores a conversation entry", async () => {
    const createConversationEntry = vi.fn().mockResolvedValue({
      id: "cev_123",
      project_id: "prj_123",
      source: "codex-local",
      entry_type: "assistant_message",
      actor: "assistant",
      content: "Implemented fix",
      summary: "Fix completed",
      tags: ["auth"],
      created_at: "2026-04-11T01:03:00.000Z"
    });

    const app = buildApp({
      conversationRepository: { createConversationEntry }
    });

    const response = await app.inject({
      method: "POST",
      url: "/projects/prj_123/conversations",
      payload: {
        source: "codex-local",
        entry_type: "assistant_message",
        actor: "assistant",
        content: "Implemented fix",
        summary: "Fix completed",
        tags: ["auth"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createConversationEntry).toHaveBeenCalledOnce();
    expect(response.json().conversation_entry.id).toBe("cev_123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/conversations.test.ts`
Expected: FAIL because the route and schema do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { z } from "zod";

export const createConversationSchema = z.object({
  source: z.string().min(1),
  entry_type: z.string().min(1),
  actor: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string().min(1),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string()).default([])
});
```

```ts
app.post("/projects/:id/conversations", async (request, reply) => {
  const projectId = request.params.id;
  const payload = createConversationSchema.parse(request.body);
  const conversationEntry = await conversationRepository.createConversationEntry({
    project_id: projectId,
    ...payload
  });
  return reply.code(201).send({ conversation_entry: conversationEntry });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/conversations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/modules/conversations/conversation-schema.ts apps/api/src/modules/conversations/conversation-repository.ts apps/api/test/conversations.test.ts
git commit -m "feat: add conversation ingestion endpoint"
```

### Task 4: Add Structured Memory Block Storage

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Create: `apps/api/src/modules/memory/memory-schema.ts`
- Create: `apps/api/src/modules/memory/memory-repository.ts`
- Test: `apps/api/test/memory.test.ts`

- [ ] **Step 1: Write the failing memory block test**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";

describe("POST /projects/:id/memory-blocks", () => {
  it("stores a memory block", async () => {
    const upsertMemoryBlock = vi.fn().mockResolvedValue({
      id: "mem_123",
      project_id: "prj_123",
      block_type: "decisions",
      title: "Validate callback URL on server",
      content: "Do validation before redirecting",
      source: "codex-local",
      importance: 0.9
    });

    const app = buildApp({
      memoryRepository: { upsertMemoryBlock }
    });

    const response = await app.inject({
      method: "POST",
      url: "/projects/prj_123/memory-blocks",
      payload: {
        block_type: "decisions",
        title: "Validate callback URL on server",
        content: "Do validation before redirecting",
        source: "codex-local",
        importance: 0.9
      }
    });

    expect(response.statusCode).toBe(201);
    expect(upsertMemoryBlock).toHaveBeenCalledOnce();
    expect(response.json().memory_block.id).toBe("mem_123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/memory.test.ts`
Expected: FAIL because the route and schema do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { z } from "zod";

export const createMemoryBlockSchema = z.object({
  block_type: z.enum(["background", "constraints", "decisions", "todo", "status"]),
  title: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
  importance: z.number().min(0).max(1).default(0.5)
});
```

```ts
app.post("/projects/:id/memory-blocks", async (request, reply) => {
  const projectId = request.params.id;
  const payload = createMemoryBlockSchema.parse(request.body);
  const memoryBlock = await memoryRepository.upsertMemoryBlock({
    project_id: projectId,
    ...payload
  });
  return reply.code(201).send({ memory_block: memoryBlock });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/modules/memory/memory-schema.ts apps/api/src/modules/memory/memory-repository.ts apps/api/test/memory.test.ts
git commit -m "feat: add memory block endpoint"
```

### Task 5: Build Context Bundle Assembly

**Files:**
- Create: `apps/api/src/modules/context/context-service.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/test/context.test.ts`

- [ ] **Step 1: Write the failing context bundle test**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";

describe("GET /projects/:id/context", () => {
  it("returns structured memory first and recent conversation summaries", async () => {
    const getProjectById = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "payments-migration"
    });

    const listMemoryBlocksByProject = vi.fn().mockResolvedValue([
      {
        id: "mem_123",
        block_type: "decisions",
        title: "Validate callback URL on server",
        content: "Do validation before redirecting",
        importance: 0.9,
        updated_at: "2026-04-11T01:05:00.000Z"
      }
    ]);

    const listConversationEntriesByProject = vi.fn().mockResolvedValue([
      {
        id: "cev_123",
        summary: "Fix completed",
        content: "Implemented fix",
        created_at: "2026-04-11T01:03:00.000Z"
      }
    ]);

    const app = buildApp({
      projectRepository: { getProjectById },
      memoryRepository: { listMemoryBlocksByProject },
      conversationRepository: { listConversationEntriesByProject }
    });

    const response = await app.inject({
      method: "GET",
      url: "/projects/prj_123/context"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().memory.decisions[0].id).toBe("mem_123");
    expect(response.json().conversation.recent_entries[0].summary).toBe("Fix completed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/context.test.ts`
Expected: FAIL because the route and context service do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export async function buildContextBundle({
  projectId,
  projectRepository,
  memoryRepository,
  conversationRepository
}) {
  const project = await projectRepository.getProjectById(projectId);
  const memoryBlocks = await memoryRepository.listMemoryBlocksByProject(projectId);
  const conversationEntries = await conversationRepository.listConversationEntriesByProject(projectId);

  return {
    project: {
      id: project.id,
      name: project.name
    },
    memory: groupMemoryBlocks(memoryBlocks),
    conversation: {
      recent_entries: conversationEntries.map((entry) => ({
        id: entry.id,
        summary: entry.summary ?? entry.content,
        created_at: entry.created_at
      }))
    },
    generated_at: new Date().toISOString()
  };
}
```

```ts
app.get("/projects/:id/context", async (request, reply) => {
  const context = await buildContextBundle({
    projectId: request.params.id,
    projectRepository,
    memoryRepository,
    conversationRepository
  });
  return reply.code(200).send(context);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/context/context-service.ts apps/api/src/routes/projects.ts apps/api/test/context.test.ts
git commit -m "feat: add context bundle endpoint"
```

### Task 6: Add Explicit Context Refresh Endpoint

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/modules/context/context-service.ts`
- Test: `apps/api/test/context.test.ts`

- [ ] **Step 1: Write the failing refresh endpoint test**

```ts
it("refreshes context with the same deterministic assembly rules", async () => {
  const buildContextBundle = vi.fn().mockResolvedValue({
    project: { id: "prj_123", name: "payments-migration" },
    memory: { background: [], constraints: [], decisions: [], todo: [], status: [] },
    conversation: { recent_entries: [] },
    generated_at: "2026-04-11T01:06:00.000Z"
  });

  const app = buildApp({
    contextService: { buildContextBundle }
  });

  const response = await app.inject({
    method: "POST",
    url: "/projects/prj_123/context/refresh"
  });

  expect(response.statusCode).toBe(200);
  expect(buildContextBundle).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/api vitest run test/context.test.ts`
Expected: FAIL because the refresh route does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
app.post("/projects/:id/context/refresh", async (request, reply) => {
  const context = await contextService.buildContextBundle({
    projectId: request.params.id,
    projectRepository,
    memoryRepository,
    conversationRepository
  });

  return reply.code(200).send(context);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/api vitest run test/context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/modules/context/context-service.ts apps/api/test/context.test.ts
git commit -m "feat: add context refresh endpoint"
```

### Task 7: Document Local Development And Example Usage

**Files:**
- Modify: `README.md`
- Create: `docs/example-requests.md`

- [ ] **Step 1: Write the failing documentation check**

Run: `rg -n "pnpm install|pnpm --dir apps/api dev|POST /projects|GET /projects/:id/context" README.md docs/example-requests.md`
Expected: FAIL because the files do not yet document setup and example API usage.

- [ ] **Step 2: Write the minimal documentation**

```md
## Local Development

1. Install dependencies with `pnpm install`
2. Start PostgreSQL locally
3. Run migrations
4. Start the API with `pnpm --dir apps/api dev`
```

```md
## Example Requests

### Create a project

Use:

`curl -X POST http://localhost:3000/projects -H "content-type: application/json" -d '{"name":"payments-migration","description":"shared context"}'`
```

- [ ] **Step 3: Run the documentation check**

Run: `rg -n "pnpm install|pnpm --dir apps/api dev|POST /projects|GET /projects/:id/context" README.md docs/example-requests.md`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md docs/example-requests.md
git commit -m "docs: add local development and request examples"
```

## Self-Review Notes

- Spec coverage: the plan covers project creation, conversation ingestion, memory blocks, context assembly, explicit refresh, and local docs.
- Placeholder scan: no unfinished placeholder markers should remain in this plan.
- Type consistency: route names, module names, and entity names are consistent with the approved design spec.
