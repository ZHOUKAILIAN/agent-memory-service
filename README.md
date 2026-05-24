# agent-memory-service

[中文说明](README-zh.md)

`agent-memory-service` is a CLI-first memory bridge for agents that lose continuity when the runtime changes.

It is built for a specific pain: you resolve a workspace/task once, then switch Codex provider or base URL, and the next agent run looks like a different session. This project keeps those locator changes attached to the same `workspace` / `projectId` / `taskId` without reading private transcripts.

## Current status

Implemented today:

- workspace/task binding through `resolve`
- context restore through `context`
- progress capture through `checkpoint`
- metadata-only locator recording through `agent-sessions record|list`
- one-command Codex provider/base URL continuity demo
- metadata-only discovery for Codex, Gemini, and Claude candidates
- `discover all` cross-CLI candidate grouping
- `doctor` diagnostics, JSON output, cross-CLI coverage, and Markdown smoke reports

Not implemented yet:

- full transcript synchronization across CLIs
- automatic repair of every runtime issue
- MCP / IDE integration
- hosted dashboard
- SSO / enterprise permissions

## What problem it solves

- Agent CLI sessions break continuity across restarts, machines, or tools.
- Codex/Gemini/Claude locator discovery and Codex `provider` / `base_url` switches can make the same engineering thread look unrelated.
- Teams need a safe bridge that tracks ownership metadata instead of copying raw conversation history.

## Why metadata instead of transcripts

The product value here is not “store more chat”. It is “bind different agent entry points back to one workspace/task”.

For AMS-003, the continuity flow records only locator metadata:

- workspace binding facts
- project/task binding facts
- agent CLI name and locator
- provider label
- sanitized base URL label/hash

It does **not** read private CLI transcripts, import real private session content, or upload transcripts.

## One-command demo

M2 now includes a first-pass one-command demo for the Codex provider/base URL continuity story.

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
```

What it does:

- creates a temporary workspace by default, or uses `--workspace <path>` if you provide one
- runs `resolve` against the configured API
- records two fake Codex locators with different provider/base URL metadata
- runs `doctor` and prints a human-readable continuity result or stable JSON
- redacts fake query tokens and stores metadata only

Important M2 boundary:

- this is a productized wrapper around the existing local flow
- the project now supports a first metadata-only cross-CLI discovery path for Codex, Gemini, and Claude, but it still does not import transcript content
- it does not read private CLI transcripts or upload transcripts
- if the API is not running, the demo fails early because `resolve` still depends on `AGENT_MEMORY_BASE_URL`

Full walkthrough: [docs/demo/codex-base-url-continuity.md](docs/demo/codex-base-url-continuity.md)

## Manual demo steps

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"

pnpm -C apps/cli start resolve --workspace "$PWD" --name demo-task

pnpm -C apps/cli start agent-sessions record \
  --workspace "$PWD" \
  --agent-cli codex \
  --locator codex-provider-a \
  --provider provider-a \
  --base-url 'https://api.first.example/v1?token=secret-a'

pnpm -C apps/cli start agent-sessions record \
  --workspace "$PWD" \
  --agent-cli codex \
  --locator codex-provider-b \
  --provider provider-b \
  --base-url 'https://api.second.example/v1?token=secret-b'

pnpm -C apps/cli start doctor --workspace "$PWD"
pnpm -C apps/cli start doctor --workspace "$PWD" --json
pnpm -C apps/cli start agent-sessions list --workspace "$PWD"
pnpm -C apps/cli start agent-sessions list --workspace "$PWD" --json
```

Expected result:

- both Codex locators appear under the same workspace
- both share the same `projectId` and `taskId`
- default output is human-readable for demos
- `--json` remains available for scripts
- only sanitized metadata is shown; secrets in query strings are not echoed

## Safety promise

- metadata only
- does not read private CLI transcripts
- does not upload transcripts
- does not import real private session content

## CLI commands

- `doctor`: inspect environment, workspace binding, locator summary, safety boundary, and next steps
- `resolve`: bind the current workspace to a project/task
- `context`: fetch the current context bundle
- `checkpoint`: write task progress and decisions
- `flush-outbox`: retry deferred sync events
- `agent-sessions record|list`: record and inspect agent session locators
- `demo codex-continuity`: run the M2 one-command continuity demo with human-readable or `--json` output

`doctor` is the M1 onboarding entry for checking whether continuity is already wired up in the current workspace. Use `--json` for script output.

`agent-sessions` now defaults to product-readable terminal output. Use `--json` when you need a stable machine-readable contract.

## Deep dive

- FAQ: [docs/faq.md](docs/faq.md)
- Product roadmap and acceptance: [docs/product/roadmap.md](docs/product/roadmap.md)
- Release update template: [docs/release-update-template.md](docs/release-update-template.md)
- Integration guide for agent tool authors: [docs/integrations/agent-tool-authors.md](docs/integrations/agent-tool-authors.md)
- Technical design: [docs/technical-design/agent-cli-session-memory-discovery.md](docs/technical-design/agent-cli-session-memory-discovery.md)
- Demo script: [docs/demo/codex-base-url-continuity.md](docs/demo/codex-base-url-continuity.md)
- Demo capture guide: [docs/demo/capture-guide.md](docs/demo/capture-guide.md)

## Repository layout

```text
.
├── apps
│   ├── cli
│   └── api
├── docs
├── README.md
├── README-zh.md
└── package.json
```

## Local development

### Requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL
- `psql` available in your shell for migrations

### Start the API

```bash
pnpm install
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/project_memory_service"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

### Useful commands

```bash
pnpm -C apps/cli test
pnpm -C apps/cli test:e2e
pnpm -C apps/api test
pnpm -C apps/api typecheck
```

### Use the `agent-memory` binary locally

The CLI package exposes an `agent-memory` binary for the commands used in the docs. From a local checkout, link it with:

```bash
pnpm install
pnpm --filter @agent-memory-service/cli link --global
agent-memory help
```

If you do not want a global link, keep using the workspace form:

```bash
pnpm -C apps/cli start doctor --workspace "$PWD"
```

### Discover multi-CLI locator metadata

After the demo, try the first real metadata discovery path:

```bash
agent-memory discover codex --home ~/.codex
agent-memory discover gemini --gemini-home ~/.gemini
agent-memory discover claude --claude-home ~/.claude
agent-memory discover codex --codex-home ~/.codex --record codex-1
```

M4 discovery is metadata-only across Codex, Gemini, and Claude: it uses candidate paths, file stats, and safe top-level identifiers. It does not import transcript/message/content/token/query fields and does not upload private session content.

### Cross-CLI discovery polish

`agent-memory discover all` scans Codex, Gemini, and Claude homes in one pass and groups metadata-only candidates by CLI. `agent-memory doctor` also reports cross-CLI coverage so you can see which agents already have locators attached to the current workspace/task.

### Share a smoke report

Use `agent-memory doctor --report` to generate a Markdown smoke report with binding status, cross-CLI coverage, recent locators, safety boundaries, and next steps. It is designed to be pasted into issues, release notes, or onboarding docs without leaking token query strings.
