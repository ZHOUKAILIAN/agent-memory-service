# V1 Scope

## Goal

Ship a small but real shared project memory service that can:

- create and identify projects
- ingest raw conversation records
- upsert structured project memory
- return a continuation-friendly context bundle

## In Scope

- Project creation and lookup
- Conversation ingestion through HTTP
- Structured memory block storage through HTTP
- Deterministic context assembly rules
- Basic recency and type-based retrieval
- Local development setup
- Automated tests for API behavior and context assembly

## Out of Scope

- SSO and enterprise auth
- fine-grained permissions
- vector search
- semantic ranking
- web dashboard
- rich SDK support
- model-generated summaries as a hard dependency

## Success Criteria

- An agent can create a project and receive a stable `project_id`
- Another agent can append conversation entries to the same project
- A tool can write normalized project memory blocks to the same project
- Any agent can request `GET /projects/:id/context` and receive a useful continuation payload
- The response is useful without requiring full transcript replay

## Delivery Shape

The first milestone should produce a single API service with a small schema, a migration path, and tests that prove the core read and write flows.
