# Demo capture guide

Use this guide to produce screenshots, terminal recordings, short videos, or launch-post snippets for `agent-continuity-bridge` without leaking private data or overstating current capabilities.

The best M6 demo asset is not a long architecture tour. It is a tight continuity story:

> Same workspace. Provider/base URL changed. Project/task identity stayed stable. No private transcript was imported.

## Audience

This guide is for maintainers preparing:

- README screenshots
- GitHub release visuals
- social posts
- issue/PR smoke reports
- short terminal recordings
- conference or demo clips

## Demo story arc

Keep the demo to four beats:

1. **Problem:** agent CLI continuity breaks when runtime/provider/entry point changes.
2. **Action:** run the one-command continuity demo.
3. **Proof:** two locator records map back to one `projectId` / `taskId`.
4. **Safety:** output shows sanitized metadata only, not private transcripts or token query strings.

## Recommended terminal setup

Use a clean terminal window and large readable font.

```bash
node --version
pnpm --version
git status --short --branch
```

Expected repository state before capture:

```text
## main...origin/main
```

If the API is required for the demo, start it separately and do not show secrets in the recording.

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/agent_continuity_bridge"
pnpm -C apps/api db:migrate
pnpm -C apps/api dev
```

In the capture terminal, use only a local demo base URL:

```bash
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
```

## Primary capture: one-command continuity demo

Run:

```bash
pnpm -C apps/cli start demo codex-continuity
```

Capture the part of the output that shows:

- generated demo workspace path
- one stable `projectId`
- one stable `taskId`
- two Codex locators
- provider/base URL labels are sanitized
- safety boundary text

Then run the machine-readable version for an assertion screenshot:

```bash
pnpm -C apps/cli start demo codex-continuity --json
```

Capture these JSON checks if present:

- `sameProjectTask: true`
- `queryTokenRedacted: true`
- `doctor.locators.count: 2`

## Secondary capture: doctor smoke report

Create or reuse a resolved demo workspace, then run:

```bash
pnpm -C apps/cli start doctor --workspace "$PWD" --report
```

Good screenshot sections:

- `Summary`
- `Coverage by CLI`
- `Safety`
- `Next steps`

This is the best format for GitHub issues, release notes, or onboarding docs because it is already Markdown.

## Optional capture: cross-CLI discovery

If you have safe fixture homes, prefer explicit fake/sandbox paths instead of real CLI homes.

```bash
pnpm -C apps/cli start discover all --workspace "$PWD" --home ./fixtures/agent-homes
```

The visual point is that candidates are grouped by CLI while staying metadata-only. Do not record real private home-directory contents.

## What to highlight in captions

Use short captions like:

- `Provider changed; project/task identity stayed stable.`
- `Metadata-only continuity: locator facts, not transcript sync.`
- `Doctor report: share workspace binding, coverage, safety, and next steps.`
- `Cross-CLI discovery is candidate metadata, not private chat import.`

## What not to show

Do not capture or publish:

- real `~/.codex`, `~/.gemini`, or Claude transcript content
- Authorization headers
- cookies
- API keys
- token query strings
- private repository paths if they reveal sensitive customer/project names
- screenshots that imply MCP/IDE integration is already complete
- claims that the project is guaranteed to reach a specific GitHub star count

## Redaction checklist

Before publishing, inspect every frame or screenshot:

- [ ] No token query string is visible.
- [ ] No cookie or Authorization header is visible.
- [ ] No private transcript/message/content fields are visible.
- [ ] No private customer/user/project name is visible unless intentionally public.
- [ ] Captions say metadata-only when session/discovery language appears.
- [ ] Captions do not describe roadmap items as current features.

## Suggested 45-second video script

```text
Agents often lose continuity when you switch provider, base URL, or CLI entry point.

agent-continuity-bridge keeps continuity attached to the workspace/project/task instead of the provider path.

Here, the demo records two Codex locators with different provider/base URL metadata.

Doctor shows both locators still map back to the same projectId and taskId.

The important boundary: this is metadata only. No private transcript import, no token query string leakage.

That is the product: a small continuity bridge for multi-agent engineering workflows.
```

## Suggested release visual set

For one release/update, use at most three visuals:

1. One terminal screenshot of `demo codex-continuity`.
2. One `--json` or `doctor --report` proof screenshot.
3. One cropped safety-boundary screenshot.

Avoid flooding the README or release post with every command. A clear story beats a wall of terminal output.

## Verification before capture

Run:

```bash
pnpm test
pnpm typecheck
```

Only capture from a commit that passes both checks.
