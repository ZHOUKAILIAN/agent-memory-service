# Task-Centric API Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first real task-centric server API so the CLI can move from project-level bindings to task-level sync without waiting for the full detail-memory model.

**Architecture:** Extend the existing Fastify API with a thin task domain that sits alongside the current project endpoints. Add `projects/resolve`, `tasks/resolve`, `tasks/:id/context`, and `tasks/:id/checkpoints`, backed by new PostgreSQL tables for tasks, task summary memory, and task checkpoints. Keep the initial scope summary-first: task context should return project metadata, task metadata, current summary state, and recent checkpoints.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Zod, Vitest

---

## Planned File Structure

- `apps/api/src/db/migrations/002_tasks.sql` for task tables
- `apps/api/src/modules/projects/project-repository.ts` to add project resolve lookups
- `apps/api/src/modules/projects/project-schema.ts` for project resolve validation
- `apps/api/src/modules/tasks/task-schema.ts` for task validation
- `apps/api/src/modules/tasks/task-repository.ts` for task persistence and resolve
- `apps/api/src/modules/tasks/task-summary-repository.ts` for summary state persistence
- `apps/api/src/modules/tasks/task-checkpoint-repository.ts` for checkpoint persistence
- `apps/api/src/modules/tasks/task-context-service.ts` for task context assembly
- `apps/api/src/routes/tasks.ts` for task routes
- `apps/api/src/app.ts` and `apps/api/src/server.ts` for dependency wiring
- `apps/api/test/task-resolve.test.ts` for resolve endpoints
- `apps/api/test/task-context.test.ts` for task context endpoint
- `apps/api/test/task-checkpoints.test.ts` for checkpoint endpoint

### Task 1: Add Project Resolve Endpoint

**Files:**
- Modify: `apps/api/src/modules/projects/project-schema.ts`
- Modify: `apps/api/src/modules/projects/project-repository.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/test/task-resolve.test.ts`

- [ ] **Step 1: Write the failing project resolve test**
- [ ] **Step 2: Run the test and verify it fails**
- [ ] **Step 3: Implement `POST /projects/resolve` with lookup-by-repo-url then lookup-by-name then create**
- [ ] **Step 4: Run the test and verify it passes**

### Task 2: Add Task Resolve Endpoint And Tables

**Files:**
- Create: `apps/api/src/db/migrations/002_tasks.sql`
- Create: `apps/api/src/modules/tasks/task-schema.ts`
- Create: `apps/api/src/modules/tasks/task-repository.ts`
- Create: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/task-resolve.test.ts`

- [ ] **Step 1: Write the failing task resolve test**
- [ ] **Step 2: Run the test and verify it fails**
- [ ] **Step 3: Implement `POST /tasks/resolve` with lookup-by-(project_id,title) and optional lookup-by-external-ref**
- [ ] **Step 4: Run the test and verify it passes**

### Task 3: Add Task Checkpoints And Summary State

**Files:**
- Create: `apps/api/src/modules/tasks/task-summary-repository.ts`
- Create: `apps/api/src/modules/tasks/task-checkpoint-repository.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Test: `apps/api/test/task-checkpoints.test.ts`

- [ ] **Step 1: Write the failing checkpoint test**
- [ ] **Step 2: Run the test and verify it fails**
- [ ] **Step 3: Implement `POST /tasks/:id/checkpoints` to insert a checkpoint and update task summary state**
- [ ] **Step 4: Run the test and verify it passes**

### Task 4: Add Task Context Endpoint

**Files:**
- Create: `apps/api/src/modules/tasks/task-context-service.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Test: `apps/api/test/task-context.test.ts`

- [ ] **Step 1: Write the failing task context test**
- [ ] **Step 2: Run the test and verify it fails**
- [ ] **Step 3: Implement `GET /tasks/:id/context` returning project, task, summary, recent checkpoints, and generated_at**
- [ ] **Step 4: Run the test and verify it passes**

### Task 5: Upgrade CLI To Use Task Binding

**Files:**
- Modify: `apps/cli/src/http/client.ts`
- Modify: `apps/cli/src/storage/sqlite.ts`
- Modify: `apps/cli/src/commands/resolve.ts`
- Modify: `apps/cli/src/commands/context.ts`
- Modify: `apps/cli/src/commands/checkpoint.ts`
- Test: `apps/cli/test/resolve.test.ts`
- Test: `apps/cli/test/context.test.ts`
- Test: `apps/cli/test/checkpoint.test.ts`

- [ ] **Step 1: Write the failing CLI tests for task binding**
- [ ] **Step 2: Run the tests and verify they fail**
- [ ] **Step 3: Switch CLI resolve/context/checkpoint to `project resolve -> task resolve -> task context -> task checkpoints`**
- [ ] **Step 4: Run the tests and verify they pass**

### Task 6: Verify

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`

- [ ] **Step 1: Run CLI tests**
- [ ] **Step 2: Run API tests**
- [ ] **Step 3: Run API and CLI typecheck**
- [ ] **Step 4: Update README examples to show task-centric resolve flow**
