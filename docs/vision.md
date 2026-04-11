# Vision

## Why This Exists

Agent work is increasingly split across local IDEs, desktop apps, browsers, mobile clients, and vendor-specific runtimes. The useful memory created in one place rarely becomes reusable in another. Users end up re-explaining the same project background, constraints, and recent decisions every time they switch tools.

`project-memory-service` exists to make project memory portable across agents.

## Product Thesis

If agents can read and write to a shared project memory layer, then users can move work across clients and sessions without losing the engineering context that was already established.

The shared memory layer should preserve two truths at once:

- Raw history matters because it preserves source evidence and sequence
- Structured memory matters because it makes continuation efficient

## Product Principles

### Project-first, not chat-first

The primary unit is a project or requirement thread, not an individual conversation.

### Structured memory is the default reading surface

Agents should read a concise, normalized context bundle before diving into raw transcripts.

### Raw history remains available

The service should never force everything into summaries only. Agents and tools may still need the original event stream.

### Generic ingestion beats client lock-in

The first release should expose a clean HTTP API so different agents can integrate without SDK dependence.

### Practical over magical

The first version should solve continuity and reuse before adding advanced retrieval or AI summarization layers.
