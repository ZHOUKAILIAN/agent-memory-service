# Testing quickstart

This is the shortest path for trying the current GitHub preview build locally.

## Requirements

- Node.js 22+
- pnpm 10+
- Git

Check:

```bash
node --version
pnpm --version
```

## Install from GitHub source

```bash
git clone https://github.com/ZHOUKAILIAN/agent-continuity-bridge.git
cd agent-continuity-bridge
pnpm install
```

Optional: expose the local `agent-continuity` binary globally. The older `agent-memory` command is still available as an alias.

```bash
cd apps/cli
pnpm link --global
agent-continuity help
cd ../..
```

If your pnpm global bin directory is not configured, set `PNPM_HOME` / `global-bin-dir` according to your local pnpm setup. You can also skip global linking and use `pnpm -C apps/cli start ...` commands below.

## Verify the checkout

```bash
pnpm test
pnpm typecheck
```

## Start the API

The CLI `resolve`, `context`, `handoff`, and `baseurl switch` flows need the API for project/task context.

Set up Postgres according to your local environment, then export `DATABASE_URL`:

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/agent_continuity_bridge"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

In another terminal:

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
```

## Try the one-command demos

```bash
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
pnpm -C apps/cli start demo handoff-continuity
pnpm -C apps/cli start demo handoff-continuity --json
```

Expected signs of success:

- `Same project/task: yes`
- `Query token redacted: yes`
- `Structured context only: yes`
- `Has safety boundary: yes`

## Try baseUrl switch continuity cache

Use a real workspace/repo you are comfortable testing in, or create a temporary directory.

```bash
mkdir -p /tmp/acb-test-workspace
cd /tmp/acb-test-workspace
```

Resolve the workspace to a task:

```bash
agent-continuity resolve --name acb-test-task
# or without global link:
# pnpm -C /path/to/agent-continuity-bridge/apps/cli start resolve --workspace "$PWD" --name acb-test-task
```

Record the first base URL:

```bash
agent-continuity baseurl switch \
  --agent-cli codex \
  --provider provider-a \
  --base-url "https://api.first.example/v1?token=fake-secret-a" \
  --yes
```

Switch to another base URL:

```bash
agent-continuity baseurl switch \
  --agent-cli codex \
  --provider provider-b \
  --base-url "https://api.second.example/v1?token=fake-secret-b" \
  --yes
```

Expected signs of success:

- terminal panel says `AMS continuity cache`
- `changed: yes`
- `preservedContext: yes`
- `previousBaseUrl: https://api.first.example`
- `currentBaseUrl: https://api.second.example`
- no `token=fake-secret-*` appears in output

Inspect the local cache:

```bash
cat .agent-memory/cache/continuation-latest.json
cat .agent-memory/cache/baseurl-switches.jsonl
```

The cache should include project/task identity and structured continuation fields, not private transcript text.

## Try handoff resume

```bash
agent-continuity handoff resume
# or:
# pnpm -C /path/to/agent-continuity-bridge/apps/cli start handoff resume --workspace "$PWD"
```

This renders a continuation prompt for the current workspace/task.

## Current safety boundary

This preview is intentionally metadata/structured-context first:

- records workspace/project/task identity
- records provider/base URL as sanitized metadata
- writes structured continuation cache
- does not import private transcripts
- does not upload private CLI session content
- does not echo query-string tokens

## Cleanup

For a test workspace, remove local continuity bridge state with:

```bash
rm -rf .agent-memory
```
