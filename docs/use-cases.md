# Use Cases

## 1. Continue Work Across Devices

A user completes part of a requirement with a local coding agent on desktop. Later, the user opens a mobile agent and wants to continue the same requirement without repeating the full background.

Flow:

1. The desktop agent writes conversation entries and structured memory to the same `project_id`
2. The mobile agent requests the project context bundle
3. The mobile agent receives decisions, constraints, current status, and recent summaries
4. The user continues from the current state instead of replaying the entire history

## 2. Preserve Engineering Decisions Outside the Transcript

An agent finishes a debugging session and extracts the final decision and follow-up tasks into structured memory blocks. A later agent can read the result directly even if it never sees the original long transcript.

## 3. Build a Thin Integration for Any Agent

A new client does not need a full SDK in `v1`. It can call the HTTP API directly:

- create or look up a project
- send conversation entries
- write memory blocks
- fetch the context bundle before responding

## 4. Keep Evidence and Summaries Together

Structured memory alone can drift away from source material. Raw conversation entries remain available so future tools can trace why a decision was recorded.
