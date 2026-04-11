# project-memory-service

Shared project memory service for multi-agent collaboration.

`project-memory-service` is a shared memory layer for agents working on the same engineering task across devices and sessions. It stores both raw conversation events and structured project memory, then returns a compact context bundle that helps the next agent continue work without needing the user to restate the full background.

## Problem

Today, agent memory is fragmented by client and session:

- A local coding session may accumulate useful context that never reaches a mobile agent.
- A phone-based follow-up may require the user to restate the project background, constraints, and latest decisions.
- Important engineering context often lives only inside chat history, which is hard to reuse across tools.

## Product Direction

The first version focuses on a generic HTTP API instead of a specific client integration. Any agent or tool can write project memory and fetch a context bundle by `project_id`.

The service treats two memory forms as first-class data:

- Raw conversation records
- Structured project memory such as background, constraints, decisions, todo items, and current status

When an agent requests context, the service returns structured memory first and supplements it with relevant conversation summaries.

## V1 Goals

- Create a project-scoped shared memory service
- Accept raw conversation and tool-result ingestion from any agent
- Store structured project memory blocks
- Assemble a reusable context bundle for the next agent session
- Keep the initial API and storage model simple enough to iterate quickly

## V1 Non-Goals

- Full agent authentication and enterprise-grade authorization
- Vector database integration
- Web admin console
- Billing, quotas, or multi-tenant organization management
- Deep vendor-specific SDK integrations

## Core Concepts

### `Project`

The boundary for a requirement, codebase, or ongoing engineering thread.

### `ConversationEntry`

A raw message, tool result, or summary event produced by an agent.

### `MemoryBlock`

A structured memory record attached to a project. Initial block types:

- `background`
- `constraints`
- `decisions`
- `todo`
- `status`

### `ContextBundle`

The assembled response that an agent requests before continuing work. It prioritizes structured memory and includes a selected slice of supporting conversation history.

## Proposed Initial Stack

- TypeScript
- Node.js
- Fastify
- PostgreSQL
- Zod
- Vitest

## Repository Layout

```text
.
├── README.md
├── docs
│   ├── api-draft.md
│   ├── data-model.md
│   ├── use-cases.md
│   ├── v1-scope.md
│   ├── vision.md
│   └── superpowers
│       ├── plans
│       └── specs
```

## Current Status

This repository currently contains the product definition and implementation plan for `v1`. The next step is to review the spec, confirm the implementation plan, and then start building the API service.
