# Data Model

## Entities

### `projects`

Represents a shared engineering thread or requirement boundary.

Suggested fields:

- `id`
- `name`
- `description`
- `repo_url`
- `created_at`
- `updated_at`

### `conversation_entries`

Stores raw chat or tool events tied to a project.

Suggested fields:

- `id`
- `project_id`
- `source`
- `entry_type`
- `actor`
- `content`
- `summary`
- `tags`
- `created_at`

### `memory_blocks`

Stores normalized project memory for efficient continuation.

Suggested fields:

- `id`
- `project_id`
- `block_type`
- `title`
- `content`
- `source`
- `importance`
- `created_at`
- `updated_at`

## Relationships

- one `project` has many `conversation_entries`
- one `project` has many `memory_blocks`

## Context Assembly Rules

The `ContextBundle` should be assembled using simple deterministic rules in `v1`:

1. Load the project metadata
2. Group memory blocks by `block_type`
3. Sort memory blocks by `importance` descending, then `updated_at` descending
4. Select recent conversation entries by `created_at` descending
5. Prefer `summary` over full `content` when both exist for the continuation payload

## Notes

`v1` should avoid premature normalization beyond these three tables. If richer linkage becomes necessary later, it can be added after observing actual usage patterns.
