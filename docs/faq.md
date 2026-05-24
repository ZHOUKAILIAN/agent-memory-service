# FAQ

This FAQ explains what `agent-memory-service` is today, what it is not, and why the project is intentionally metadata-first.

## What is agent-memory-service?

`agent-memory-service` is a CLI-first continuity bridge for engineering agents. It helps a workspace keep the same `projectId` / `taskId` identity when the agent entry point changes, such as switching Codex provider/base URL or moving between supported CLI sources.

The current product story is continuity across runtime changes, not unlimited chat history storage.

## What problem does it solve?

Agent tools often treat a new provider, base URL, machine, or CLI entry point as a fresh session. That makes the next run lose the thread even when the developer is still in the same repository and working on the same task.

AMS keeps stable workspace/task facts in a local bridge and records safe locator metadata so those entry points can be mapped back to the same project/task identity.

## Why metadata instead of full transcripts?

Because the continuity question usually starts with: “Is this still the same workspace and task?” You can answer that with stable identity facts and safe source metadata without copying private conversation text.

The product deliberately records things like:

- workspace/project/task binding facts
- agent CLI type, such as `codex`, `gemini`, or `claude`
- locator identifiers
- provider labels
- sanitized base URL origins / hashes
- file stats and safe top-level identifiers during discovery

It must not import private message content, transcript text, tokens, cookies, Authorization headers, or raw environment secrets.

## Does it read my `~/.codex`, `~/.gemini`, or Claude transcripts?

No. The current discovery path is metadata-only. It may inspect candidate paths, file stats, and safe top-level identifiers, but it must not import transcript/message/content fields or upload private session content.

## Does it upload anything private?

The CLI bridge is designed around local workspace binding and metadata-only locator records. The current cross-CLI discovery story does not upload private transcripts. Base URL output is sanitized so query-string tokens are not echoed.

## How is this different from chat history sync?

Chat history sync tries to move or replay conversation content. AMS focuses on stable project/task identity and continuation facts.

That means the important question is not “can we copy every old message into the next agent?” It is “can the next agent discover the right project/task context without asking the user to re-explain the same engineering thread?”

## What can I try today?

Start with the one-command continuity demo:

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
```

Then inspect a workspace:

```bash
pnpm -C apps/cli start doctor --workspace "$PWD"
pnpm -C apps/cli start doctor --workspace "$PWD" --report
pnpm -C apps/cli start discover all --workspace "$PWD"
```

## What is currently supported?

Current implemented product assets include:

- workspace `resolve` into project/task binding
- task `context` and `checkpoint` CLI flows
- local `agent-sessions record|list` locator metadata
- one-command Codex provider/base URL continuity demo
- metadata-only discovery commands for Codex, Gemini, and Claude candidates
- `discover all` cross-CLI scan
- `doctor` diagnostics, JSON output, cross-CLI coverage, and Markdown smoke reports

## What is not supported yet?

Not yet supported:

- full transcript synchronization across CLIs
- automatic repair of every local runtime issue
- MCP / IDE integration
- hosted dashboard
- SSO / enterprise permissions
- semantic/vector retrieval as a required dependency

Those may appear in future milestones, but they should not be described as current capabilities until implemented.

## Why should an open-source developer star or try it?

If you use agent CLIs heavily, this project targets a real annoyance: losing task continuity when the runtime changes. The project is small enough to understand, has a concrete demo path, and is opinionated about privacy boundaries.

A star is useful if you want a metadata-first continuity layer for multi-agent engineering workflows to keep evolving.

## Is the `1000+ GitHub stars` goal a promise?

No. It is a product and distribution calibration target, not a guaranteed outcome. The project should optimize toward clear positioning, real demos, strong safety boundaries, and useful integration surfaces without promising a star count.

## Where should I look next?

- Roadmap and acceptance: [docs/product/roadmap.md](product/roadmap.md)
- Demo walkthrough: [docs/demo/codex-base-url-continuity.md](demo/codex-base-url-continuity.md)
- Technical design: [docs/technical-design/agent-cli-session-memory-discovery.md](technical-design/agent-cli-session-memory-discovery.md)
