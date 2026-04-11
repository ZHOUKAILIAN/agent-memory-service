# API Draft

## API Style

- JSON over HTTP
- project-scoped endpoints
- server-generated ids
- ISO 8601 timestamps

## `POST /projects`

Creates a project boundary for shared memory.

### Request

```json
{
  "name": "payments-migration",
  "description": "Cross-agent memory for the payments migration requirement",
  "repo_url": "https://github.com/acme/payments"
}
```

### Response

```json
{
  "project": {
    "id": "prj_01jr7m6yd76s0f3x6x9h7x8h3a",
    "name": "payments-migration",
    "description": "Cross-agent memory for the payments migration requirement",
    "repo_url": "https://github.com/acme/payments",
    "created_at": "2026-04-11T01:00:00.000Z"
  }
}
```

## `POST /projects/:id/conversations`

Appends a raw conversation or tool event.

### Request

```json
{
  "source": "codex-local",
  "entry_type": "assistant_message",
  "actor": "assistant",
  "content": "Implemented the login callback fix and updated the tests.",
  "summary": "Login callback fix completed with tests updated",
  "tags": ["login", "auth", "tests"]
}
```

### Response

```json
{
  "conversation_entry": {
    "id": "cev_01jr7m9d7f72tk7m5x4k82m8ch",
    "project_id": "prj_01jr7m6yd76s0f3x6x9h7x8h3a",
    "source": "codex-local",
    "entry_type": "assistant_message",
    "actor": "assistant",
    "content": "Implemented the login callback fix and updated the tests.",
    "summary": "Login callback fix completed with tests updated",
    "tags": ["login", "auth", "tests"],
    "created_at": "2026-04-11T01:03:00.000Z"
  }
}
```

## `POST /projects/:id/memory-blocks`

Creates or updates structured project memory.

### Request

```json
{
  "block_type": "decisions",
  "title": "Use callback URL validation on the server",
  "content": "The callback URL must be validated on the server side before redirecting the user.",
  "source": "codex-local",
  "importance": 0.9
}
```

### Response

```json
{
  "memory_block": {
    "id": "mem_01jr7mb4zxm2a5k6vg8jv6p6cd",
    "project_id": "prj_01jr7m6yd76s0f3x6x9h7x8h3a",
    "block_type": "decisions",
    "title": "Use callback URL validation on the server",
    "content": "The callback URL must be validated on the server side before redirecting the user.",
    "source": "codex-local",
    "importance": 0.9,
    "created_at": "2026-04-11T01:05:00.000Z",
    "updated_at": "2026-04-11T01:05:00.000Z"
  }
}
```

## `GET /projects/:id/context`

Returns an assembled context bundle for agent continuation.

### Query Parameters

- `limit`: optional integer for supporting conversation entry count

### Response

```json
{
  "project": {
    "id": "prj_01jr7m6yd76s0f3x6x9h7x8h3a",
    "name": "payments-migration"
  },
  "memory": {
    "background": [],
    "constraints": [],
    "decisions": [
      {
        "id": "mem_01jr7mb4zxm2a5k6vg8jv6p6cd",
        "title": "Use callback URL validation on the server",
        "content": "The callback URL must be validated on the server side before redirecting the user."
      }
    ],
    "todo": [],
    "status": []
  },
  "conversation": {
    "recent_entries": [
      {
        "id": "cev_01jr7m9d7f72tk7m5x4k82m8ch",
        "summary": "Login callback fix completed with tests updated",
        "created_at": "2026-04-11T01:03:00.000Z"
      }
    ]
  },
  "generated_at": "2026-04-11T01:06:00.000Z"
}
```

## `POST /projects/:id/context/refresh`

Triggers deterministic context regeneration for clients that want an explicit refresh step. In `v1`, this can be implemented as a thin wrapper around the same assembly service used by `GET /context`.
