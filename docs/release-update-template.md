# Release update template

Use this template for GitHub releases, milestone updates, PR descriptions that announce product capability, and launch notes. The goal is to keep every update clear, testable, and honest about the metadata-only boundary.

```markdown
# <Release title>

## One-line product story

<One sentence: what continuity problem does this release make easier?>

Example: `agent-memory-service now gives a shareable doctor report for checking whether a workspace has cross-CLI continuity coverage.`

## What changed

- <Capability 1, phrased as something a user can do now>
- <Capability 2>
- <Capability 3>

## Why it matters

- <Explain the user-visible continuity value>
- <Explain how it reduces onboarding/demo/integration friction>
- <Explain why the change supports multi-agent project/task continuity>

## Try it

```bash
pnpm install
export AGENT_MEMORY_BASE_URL="http://localhost:3000"
pnpm -C apps/cli start doctor --workspace "$PWD"
```

If this release is demo-focused, prefer the one-command demo:

```bash
pnpm -C apps/cli start demo codex-continuity
pnpm -C apps/cli start demo codex-continuity --json
```

If this release is discovery-focused, prefer:

```bash
pnpm -C apps/cli start discover all --workspace "$PWD"
pnpm -C apps/cli start doctor --workspace "$PWD" --report
```

## Expected output / acceptance

- <Observable result 1>
- <Observable result 2>
- <Observable result 3>

## Safety boundary

This release is metadata-only unless explicitly stated otherwise.

- Does not import private transcript/message/content fields.
- Does not upload private session content.
- Does not echo query-string tokens, cookies, Authorization headers, or raw environment secrets.
- Treats provider/base URL/CLI home paths as source metadata, not project identity.
- Stable continuity identity remains workspace -> project -> task binding.

## Current limitations

- <Limitation 1: what this release still does not do>
- <Limitation 2>
- <Roadmap item that remains future work>

## Verification

```bash
pnpm test
pnpm typecheck
```

## Links

- README: https://github.com/ZHOUKAILIAN/agent-memory-service
- FAQ: docs/faq.md
- Roadmap: docs/product/roadmap.md
- Demo walkthrough: docs/demo/codex-base-url-continuity.md
- Technical design: docs/technical-design/agent-cli-session-memory-discovery.md
```

## Copy checklist

Before publishing an update, check:

- [ ] Does the first paragraph say what users can do now?
- [ ] Does the update avoid calling roadmap items completed?
- [ ] Does it mention metadata-only safety boundaries when discovery/session wording appears?
- [ ] Does it include at least one runnable command?
- [ ] Does it include observable acceptance criteria?
- [ ] Does it include `pnpm test` and `pnpm typecheck` verification?
- [ ] Does it avoid promising a specific GitHub star count?
