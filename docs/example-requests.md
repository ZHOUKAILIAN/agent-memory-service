# Example Requests

## Create A Project

```bash
curl -X POST http://localhost:3000/projects \
  -H "content-type: application/json" \
  -d '{
    "name": "payments-migration",
    "description": "Shared context for the payments migration requirement",
    "repo_url": "https://github.com/acme/payments"
  }'
```

## Append A Conversation Entry

```bash
curl -X POST http://localhost:3000/projects/prj_example/conversations \
  -H "content-type: application/json" \
  -d '{
    "source": "codex-local",
    "entry_type": "assistant_message",
    "actor": "assistant",
    "content": "Implemented the login callback fix and updated the tests.",
    "summary": "Login callback fix completed with tests updated",
    "tags": ["login", "auth", "tests"]
  }'
```

## Upsert A Memory Block

```bash
curl -X POST http://localhost:3000/projects/prj_example/memory-blocks \
  -H "content-type: application/json" \
  -d '{
    "block_type": "decisions",
    "title": "Validate callback URL on the server",
    "content": "The callback URL must be validated on the server side before redirecting the user.",
    "source": "codex-local",
    "importance": 0.9
  }'
```

## Read Context

```bash
curl "http://localhost:3000/projects/prj_example/context?limit=10"
```

## Refresh Context

```bash
curl -X POST http://localhost:3000/projects/prj_example/context/refresh
```
