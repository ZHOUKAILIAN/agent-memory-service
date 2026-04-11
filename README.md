# agent-memory-service

[中文说明](README-zh.md)

Shared memory and context sync service for AI agents.

`agent-memory-service` is a small HTTP service that helps AI agents continue the same engineering task across sessions, devices, and runtimes. It stores both raw conversation history and structured project memory, then assembles a compact context bundle so the next agent can pick up the work without replaying the whole transcript.

## Why This Exists

Agent work is often fragmented:

- one coding session has important decisions that never reach the next runtime
- mobile or follow-up agents need the user to restate background and status
- useful context is trapped inside long transcripts instead of reusable memory

This service gives all agents a shared, project-scoped memory backend.

## What V1 Ships

- Project creation with stable `project_id`
- Conversation ingestion for raw messages and tool events
- Structured memory block upsert for background, constraints, decisions, todo, and status
- Deterministic context bundle assembly
- Explicit context refresh endpoint
- PostgreSQL migration scaffold
- Automated API tests

## What V1 Does Not Ship

- Authentication or permissions
- Vector search or semantic retrieval
- Web dashboard
- SDKs for specific agent vendors
- Background workers or async indexing

## Tech Stack

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Zod
- Vitest

## Repository Layout

```text
.
├── apps
│   └── api
│       ├── src
│       └── test
├── docs
│   ├── agent-memory-patterns-research-zh.md
│   ├── agent-sync-flow-zh.md
│   ├── api-draft.md
│   ├── data-model.md
│   ├── example-requests.md
│   ├── multi-agent-sync-design-zh.md
│   ├── task-memory-layering-research-zh.md
│   ├── task-sync-alignment-zh.md
│   ├── use-cases.md
│   ├── v1-scope.md
│   └── vision.md
├── README.md
├── README-zh.md
└── package.json
```

## Data Model

### `projects`

The project boundary for a requirement, repository task, or ongoing engineering thread.

### `conversation_entries`

Raw transcript-like events written by agents or tools.

### `memory_blocks`

Normalized memory records that future agents should read first.

Supported `block_type` values in `v1`:

- `background`
- `constraints`
- `decisions`
- `todo`
- `status`

## How Context Is Built

`GET /projects/:id/context` and `POST /projects/:id/context/refresh` use the same deterministic rules:

1. load the project
2. load all memory blocks for that project
3. group them by `block_type`
4. sort each group by `importance` descending, then `updated_at` descending
5. load recent conversation entries
6. prefer `summary` over `content` for the continuation payload

The goal is to keep `v1` simple, inspectable, and easy to debug.

## API Overview

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/projects` | Create a project |
| `POST` | `/projects/:id/conversations` | Append a conversation entry |
| `POST` | `/projects/:id/memory-blocks` | Upsert a structured memory block |
| `GET` | `/projects/:id/context` | Read the assembled context bundle |
| `POST` | `/projects/:id/context/refresh` | Rebuild and return the same context bundle explicitly |

Chinese agent memory pattern research lives in [docs/agent-memory-patterns-research-zh.md](docs/agent-memory-patterns-research-zh.md).
Example requests live in [docs/example-requests.md](docs/example-requests.md).
Chinese integration flow notes live in [docs/agent-sync-flow-zh.md](docs/agent-sync-flow-zh.md).
Chinese multi-agent integration design lives in [docs/multi-agent-sync-design-zh.md](docs/multi-agent-sync-design-zh.md).
Chinese task-sync alignment notes live in [docs/task-sync-alignment-zh.md](docs/task-sync-alignment-zh.md).
Chinese task memory layering research lives in [docs/task-memory-layering-research-zh.md](docs/task-memory-layering-research-zh.md).

## Local Development

### Requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL
- `psql` available on your shell path for the migration script

### Setup

```bash
pnpm install
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/project_memory_service"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

The API starts on `http://localhost:3000`.

### Useful Commands

```bash
pnpm -C apps/api dev
pnpm -C apps/api test
pnpm -C apps/api typecheck
pnpm -C apps/api db:migrate
```

## Testing

The current test suite covers:

- health check
- project creation
- conversation ingestion
- memory block upsert
- deterministic context assembly
- explicit refresh behavior

Run everything with:

```bash
pnpm -C apps/api test
pnpm -C apps/api typecheck
```

## Current Status

`v1` is implemented as a single Fastify API service with repository abstractions, deterministic context assembly, PostgreSQL migration scaffolding, and endpoint tests.

The main remaining runtime step outside this repository is providing a real `DATABASE_URL` and PostgreSQL instance for end-to-end local bring-up.

## Roadmap Ideas

- auth and tenancy
- semantic retrieval
- model-assisted memory refresh
- SDKs for agent runtimes
- inspection UI for project memory
