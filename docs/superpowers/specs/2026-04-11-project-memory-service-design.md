# Project Memory Service Design

## Summary

`project-memory-service` is a shared memory layer for multi-agent engineering work. It stores both raw conversation history and structured project memory, then returns an assembled context bundle so another agent can continue the same project without requiring the user to restate the background.

## Problem

Agent memory is fragmented by runtime, session, and client. Work done with one agent often becomes invisible to the next agent, even when both are helping on the same requirement. Users repeatedly pay the cost of context transfer by restating the same background, constraints, and recent progress.

## Goals

- provide a project-scoped shared memory API
- preserve both raw history and structured project memory
- let any agent continue work from a compact context bundle
- keep the first version generic and easy to integrate

## Non-Goals

- build a full end-user web platform in `v1`
- implement enterprise auth and permission systems
- depend on vector retrieval for the first release
- create vendor-specific SDKs before the generic API is proven

## Users

### Primary user

A developer who moves work across local coding agents, desktop tools, and mobile clients while continuing the same engineering requirement.

### Secondary user

An agent or tool integration that needs a neutral project memory backend.

## Product Definition

The service exposes a generic HTTP API centered on the `project` entity. Each project acts as the container for:

- raw `conversation_entries`
- structured `memory_blocks`
- an assembled `context_bundle`

The service is designed so agents can write frequently and read cheaply. Agents should read structured memory first, then use a small supporting slice of conversation history for evidence and recency.

## Data Model

### `Project`

Represents a requirement, engineering task, or codebase-specific thread.

Fields:

- `id`
- `name`
- `description`
- `repo_url`
- `created_at`
- `updated_at`

### `ConversationEntry`

Stores raw messages, tool results, and compact summaries.

Fields:

- `id`
- `project_id`
- `source`
- `entry_type`
- `actor`
- `content`
- `summary`
- `tags`
- `created_at`

### `MemoryBlock`

Stores structured memory that an agent should read before browsing full history.

Fields:

- `id`
- `project_id`
- `block_type`
- `title`
- `content`
- `source`
- `importance`
- `created_at`
- `updated_at`

Initial `block_type` values:

- `background`
- `constraints`
- `decisions`
- `todo`
- `status`

## API Surface

### `POST /projects`

Creates a new project container.

### `POST /projects/:id/conversations`

Appends a raw conversation or tool event.

### `POST /projects/:id/memory-blocks`

Creates or updates structured project memory.

### `GET /projects/:id/context`

Returns a `ContextBundle` that includes:

- project metadata
- grouped memory blocks by type
- recent summarized conversation entries
- a generated timestamp

### `POST /projects/:id/context/refresh`

Exposes an explicit refresh action for clients that want a write-before-read workflow, while still using the same deterministic context assembly rules in `v1`.

## Context Assembly Strategy

The initial strategy is intentionally simple and deterministic:

1. load the project
2. fetch all memory blocks for the project
3. group them by `block_type`
4. sort each group by `importance` descending and `updated_at` descending
5. fetch recent conversation entries sorted by `created_at` descending
6. return summaries when present, otherwise fall back to content

This keeps the system understandable and easy to debug before adding semantic retrieval or model-based summarization.

## Technical Direction

The initial implementation should use:

- TypeScript
- Node.js
- Fastify
- PostgreSQL
- Zod
- Vitest

This stack is small, well understood, and sufficient for `v1`.

## Architecture

The first release should be a single API service with a thin modular structure:

- HTTP routes for request handling
- schema validation for request and response contracts
- service layer for context assembly rules
- repository layer for database reads and writes

No separate worker or vector indexing component is required for the first milestone.

## Milestone Definition

The first milestone is complete when:

- a project can be created through the API
- conversation entries can be appended to the project
- structured memory blocks can be created and updated
- the context endpoint returns a continuation-friendly payload
- tests cover the primary read and write flows

## Risks

### Memory drift

Structured memory can become stale if integrations write raw history but never update normalized memory blocks.

Mitigation:

- make `memory_blocks` easy to write
- keep `conversation_entries` available as evidence
- provide an explicit `context/refresh` endpoint even if it is deterministic in `v1`

### Over-design before usage

It is easy to overbuild retrieval, ranking, or policy features before observing real traffic.

Mitigation:

- keep the schema small
- delay vector search
- prove the project and context loop first

## Future Extensions

- client SDKs for specific agent runtimes
- organization-level auth and permissions
- semantic retrieval
- model-assisted summary refresh
- web inspection and debugging console
