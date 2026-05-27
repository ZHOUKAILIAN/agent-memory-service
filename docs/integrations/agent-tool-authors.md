# Integration guide for agent tool authors

This guide explains how an agent CLI, IDE plugin, MCP server, or automation script should integrate with `agent-continuity-bridge` without creating a second identity system or importing private transcripts.

The short version:

> Treat AMS as the workspace/project/task continuity layer. Treat your tool's session ids, provider labels, base URLs, and local paths as metadata that can help map back to that continuity layer.

## Integration goals

A good integration should let a user:

1. Open the same repository from a supported agent entry point.
2. Resolve or reuse the workspace's AMS project/task binding.
3. Record safe locator metadata for the external agent source.
4. Fetch continuation context from the same project/task identity.
5. Continue the engineering thread without replaying private transcripts.

## Identity model

AMS continuity is anchored in this order:

1. workspace path / repository root
2. repository facts such as remote URL when available
3. local `.agent-memory/bridge.sqlite` workspace binding
4. `projectId` and `taskId`
5. optional task key or explicit user-provided task name

External tool facts are secondary metadata:

- agent CLI name, such as `codex`, `gemini`, `claude`, or `other`
- session/locator id
- provider label
- sanitized base URL origin/hash
- safe candidate path/file stat metadata

Do not use provider, base URL, account directory, or CLI home path as the primary project identity.

## Recommended integration flow

### 1. Locate the workspace

Start from the current working directory or the IDE/MCP workspace root.

Use the same workspace path consistently when invoking AMS commands:

```bash
pnpm -C apps/cli start doctor --workspace "$WORKSPACE"
```

### 2. Resolve project/task binding

If `doctor` reports that the workspace binding is missing, ask the user for a task name or use an explicit task key from your integration.

```bash
pnpm -C apps/cli start resolve --workspace "$WORKSPACE" --name "<task-name>"
```

A locator should not create a new project/task identity by itself. Resolve the workspace first, then attach source metadata.

### 3. Record safe source metadata

For a known source locator:

```bash
pnpm -C apps/cli start agent-sessions record \
  --workspace "$WORKSPACE" \
  --agent-cli codex \
  --locator "<safe-session-or-source-id>" \
  --provider "<provider-label>" \
  --base-url "https://api.example.com/v1"
```

Rules:

- `--agent-cli` should be one of `codex`, `gemini`, `claude`, or `other`.
- `--locator` should be a stable id or safe source label, not transcript content.
- `--provider` is a label, not an identity boundary.
- `--base-url` must be sanitized by AMS; do not pass URLs containing real secret query strings if avoidable.

### 4. Discover metadata-only candidates

For supported CLI homes or safe fixtures:

```bash
pnpm -C apps/cli start discover all --workspace "$WORKSPACE"
pnpm -C apps/cli start discover codex --workspace "$WORKSPACE" --codex-home "$CODEX_HOME"
pnpm -C apps/cli start discover gemini --workspace "$WORKSPACE" --gemini-home "$GEMINI_HOME"
pnpm -C apps/cli start discover claude --workspace "$WORKSPACE" --claude-home "$CLAUDE_HOME"
```

To record a selected candidate:

```bash
pnpm -C apps/cli start discover codex --workspace "$WORKSPACE" --record "<candidate-id>"
```

Discovery should remain metadata-only. Candidate records may use file stats and safe top-level identifiers. They must not import transcript/message/content fields.

### 5. Fetch continuation context

After binding exists, fetch context through the current workspace:

```bash
pnpm -C apps/cli start context --workspace "$WORKSPACE"
```

Use the returned project/task context as a continuation hint. Do not treat it as permission to read or upload external private conversation stores.

### 6. Write explicit progress checkpoints

When your integration completes meaningful work, write a structured checkpoint:

```bash
pnpm -C apps/cli start checkpoint \
  --workspace "$WORKSPACE" \
  --summary "Implemented metadata-only Codex locator discovery" \
  --decision "Provider/base URL remains source metadata, not identity"
```

Prefer short structured facts over raw transcript dumps.

## Safety requirements

Integrations must not send AMS:

- private transcript/message/content fields
- API keys
- cookies
- Authorization headers
- raw environment variables
- token query strings
- account secrets
- unrelated home-directory contents

If a future integration needs deeper access, it must add explicit user authorization, redaction, and documentation before implementation.

## Output and UX requirements

A good integration should show users:

- current workspace path
- whether project/task binding exists
- current `projectId` and `taskId` when available
- locator count and recent source metadata
- cross-CLI coverage when relevant
- clear next step if binding or locator metadata is missing
- metadata-only safety note near any session/discovery wording

Use `doctor` as the baseline UX contract:

```bash
pnpm -C apps/cli start doctor --workspace "$WORKSPACE"
pnpm -C apps/cli start doctor --workspace "$WORKSPACE" --json
pnpm -C apps/cli start doctor --workspace "$WORKSPACE" --report
```

## Common anti-patterns

Avoid these mistakes:

- creating a new AMS project every time provider/base URL changes
- treating a CLI home path as the project id
- using transcript file content as a locator
- uploading external chat logs to prove continuity
- hiding safety boundaries behind implementation details
- claiming full cross-CLI session sync when only metadata discovery exists
- claiming MCP/IDE support before the integration exists

## Minimal integration acceptance checklist

An integration is acceptable when:

- [ ] It can resolve or reuse a workspace binding.
- [ ] It records source metadata only after binding exists.
- [ ] Provider/base URL changes do not create a new project/task identity.
- [ ] It can show `doctor` output or equivalent binding/coverage status.
- [ ] It can fetch context for the current workspace.
- [ ] It does not import transcript/message/content fields.
- [ ] It does not echo tokens, cookies, Authorization headers, or raw env secrets.
- [ ] It documents current limitations honestly.

## Related docs

- FAQ: [../faq.md](../faq.md)
- Product roadmap: [../product/roadmap.md](../product/roadmap.md)
- Technical design: [../technical-design/agent-cli-session-memory-discovery.md](../technical-design/agent-cli-session-memory-discovery.md)
- Demo walkthrough: [../demo/codex-base-url-continuity.md](../demo/codex-base-url-continuity.md)
