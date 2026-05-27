# agent-continuity-bridge

[中文说明](README-zh.md)

`agent-continuity-bridge` is a CLI-first continuity bridge for agent work that should survive runtime changes.

The current product focus is narrow: bind a workspace to one `projectId` / `taskId`, then keep using that same task context after switching Codex provider, base URL, or agent CLI locator. It stores structured task checkpoints and safe locator metadata. It does not import private transcripts.

The preferred local CLI command is `agent-continuity`. `agent-memory` remains available as a compatibility alias.

## What changed

This repository started as a generic agent memory service. That older direction included raw conversation ingestion, project-level memory blocks, and project-level context bundles.

The current scope is simpler:

- use the workspace as the stable anchor
- use `resolve` to bind the workspace to a project/task
- use `checkpoint`, `context`, and `handoff` for structured task continuity
- use `baseurl switch` and `agent-sessions` to record provider/base URL/locator changes as metadata
- avoid reading or uploading private CLI transcripts

## Try it locally

### 1. Install

```bash
pnpm install
```

### 2. Start the API

The CLI continuity flow still needs the local API for project/task context.

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/agent_continuity_bridge"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

In another terminal:

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
```

### 3. Run the continuity demo

```bash
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo handoff-continuity
```

Expected signals:

- two provider/base URL locators point to the same `projectId` / `taskId`
- query tokens are redacted
- output describes metadata/structured context only
- no private transcript content is imported

Use `--json` with either demo when you want machine-readable output.

## Manual base URL continuity flow

Use a real workspace or a temporary directory:

```bash
mkdir -p /tmp/acb-demo
cd /tmp/acb-demo
```

Resolve the workspace:

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start resolve \
  --workspace "$PWD" \
  --name demo-task
```

Record the first provider/base URL:

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start baseurl switch \
  --workspace "$PWD" \
  --agent-cli codex \
  --provider provider-a \
  --base-url "https://api.first.example/v1?token=fake-secret-a" \
  --yes
```

Switch to another provider/base URL:

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start baseurl switch \
  --workspace "$PWD" \
  --agent-cli codex \
  --provider provider-b \
  --base-url "https://api.second.example/v1?token=fake-secret-b" \
  --yes
```

Then inspect continuity:

```bash
pnpm -C /path/to/agent-continuity-bridge/apps/cli start doctor --workspace "$PWD"
pnpm -C /path/to/agent-continuity-bridge/apps/cli start context --workspace "$PWD"
pnpm -C /path/to/agent-continuity-bridge/apps/cli start handoff resume --workspace "$PWD"
```

The cache is written under:

```text
.agent-memory/cache/continuation-latest.json
.agent-memory/cache/baseurl-switches.jsonl
```

## CLI commands

- `agent-continuity resolve`: bind a workspace to a project/task
- `agent-continuity checkpoint`: write task progress, decisions, constraints, and next steps
- `agent-continuity context`: fetch the current task context bundle
- `agent-continuity handoff create|resume`: create or render structured continuation context
- `agent-continuity baseurl switch`: record a provider/base URL change and preserve task context
- `agent-continuity agent-sessions record|list`: record and inspect metadata-only agent locators
- `agent-continuity discover codex|gemini|claude|all`: scan metadata-only locator candidates
- `agent-continuity doctor`: inspect binding, locator coverage, safety boundary, and next steps
- `agent-continuity flush-outbox`: retry queued task checkpoint writes
- `agent-continuity demo codex-continuity|handoff-continuity`: run local continuity demos

## Current safety boundary

- stores workspace/project/task identity
- stores provider/base URL/locator as sanitized metadata
- stores structured task checkpoints and handoff context
- does not read private CLI transcripts
- does not upload private session content
- does not echo query-string tokens

## Repository layout

```text
.
├── apps
│   ├── api
│   └── cli
├── docs
├── README.md
├── README-zh.md
└── package.json
```

## Development

```bash
pnpm -C apps/cli test
pnpm -C apps/cli test:e2e
pnpm -C apps/api test
pnpm typecheck
```

## More docs

- Testing quickstart: [docs/testing-quickstart.md](docs/testing-quickstart.md)
- FAQ: [docs/faq.md](docs/faq.md)
- Product roadmap: [docs/product/roadmap.md](docs/product/roadmap.md)
- Technical design: [docs/technical-design/agent-cli-session-memory-discovery.md](docs/technical-design/agent-cli-session-memory-discovery.md)
- Demo walkthrough: [docs/demo/codex-base-url-continuity.md](docs/demo/codex-base-url-continuity.md)
- Integration guide: [docs/integrations/agent-tool-authors.md](docs/integrations/agent-tool-authors.md)
