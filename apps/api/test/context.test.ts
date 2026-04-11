import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /projects/:id/context", () => {
  it("returns structured memory first and recent conversation summaries", async () => {
    const getProjectById = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "payments-migration",
      description: "shared context",
      repo_url: "https://github.com/acme/payments",
      created_at: "2026-04-11T01:00:00.000Z",
      updated_at: "2026-04-11T01:00:00.000Z"
    });

    const listMemoryBlocksByProject = vi.fn().mockResolvedValue([
      {
        id: "mem_older",
        project_id: "prj_123",
        block_type: "decisions",
        title: "Older decision",
        content: "Older content",
        source: "codex-local",
        importance: 0.7,
        created_at: "2026-04-11T01:04:00.000Z",
        updated_at: "2026-04-11T01:04:00.000Z"
      },
      {
        id: "mem_123",
        project_id: "prj_123",
        block_type: "decisions",
        title: "Validate callback URL on server",
        content: "Do validation before redirecting",
        source: "codex-local",
        importance: 0.9,
        created_at: "2026-04-11T01:05:00.000Z",
        updated_at: "2026-04-11T01:05:00.000Z"
      }
    ]);

    const listConversationEntriesByProject = vi.fn().mockResolvedValue([
      {
        id: "cev_123",
        project_id: "prj_123",
        source: "codex-local",
        entry_type: "assistant_message",
        actor: "assistant",
        summary: "Fix completed",
        content: "Implemented fix",
        tags: ["auth"],
        created_at: "2026-04-11T01:03:00.000Z"
      },
      {
        id: "cev_124",
        project_id: "prj_123",
        source: "codex-local",
        entry_type: "assistant_message",
        actor: "assistant",
        content: "Fallback to content",
        tags: [],
        created_at: "2026-04-11T01:02:00.000Z"
      }
    ]);

    const app = buildApp({
      projectRepository: { createProject: vi.fn(), getProjectById },
      memoryRepository: { upsertMemoryBlock: vi.fn(), listMemoryBlocksByProject },
      conversationRepository: { createConversationEntry: vi.fn(), listConversationEntriesByProject }
    });

    const response = await app.inject({
      method: "GET",
      url: "/projects/prj_123/context?limit=2"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().memory.decisions[0].id).toBe("mem_123");
    expect(response.json().memory.decisions[1].id).toBe("mem_older");
    expect(response.json().conversation.recent_entries[0].summary).toBe("Fix completed");
    expect(response.json().conversation.recent_entries[1].summary).toBe("Fallback to content");
  });
});

describe("POST /projects/:id/context/refresh", () => {
  it("refreshes context with the same deterministic assembly rules", async () => {
    const buildContextBundle = vi.fn().mockResolvedValue({
      project: { id: "prj_123", name: "payments-migration" },
      memory: { background: [], constraints: [], decisions: [], todo: [], status: [] },
      conversation: { recent_entries: [] },
      generated_at: "2026-04-11T01:06:00.000Z"
    });

    const app = buildApp({
      contextService: { buildContextBundle }
    });

    const response = await app.inject({
      method: "POST",
      url: "/projects/prj_123/context/refresh"
    });

    expect(response.statusCode).toBe(200);
    expect(buildContextBundle).toHaveBeenCalledOnce();
  });
});
