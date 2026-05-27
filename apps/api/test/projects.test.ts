import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("POST /projects", () => {
  it("creates a project", async () => {
    const createProject = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "payments-migration",
      description: "shared context",
      repo_url: "https://github.com/acme/payments",
      created_at: "2026-04-11T01:00:00.000Z",
      updated_at: "2026-04-11T01:00:00.000Z"
    });

    const app = buildApp({
      projectRepository: {
        createProject,
        getProjectById: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        name: "payments-migration",
        description: "shared context",
        repo_url: "https://github.com/acme/payments"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createProject).toHaveBeenCalledOnce();
    expect(response.json().project.id).toBe("prj_123");
  });
});

describe("removed project-memory endpoints", () => {
  it("does not expose project-level conversation, memory, or context routes", async () => {
    const app = buildApp();

    const conversationResponse = await app.inject({
      method: "POST",
      url: "/projects/prj_123/conversations",
      payload: {
        source: "codex-local",
        entry_type: "assistant_message",
        actor: "assistant",
        content: "Implemented fix",
        summary: "Fix completed",
        tags: ["auth"]
      }
    });

    const memoryResponse = await app.inject({
      method: "POST",
      url: "/projects/prj_123/memory-blocks",
      payload: {
        block_type: "decisions",
        title: "Validate callback URL on server",
        content: "Do validation before redirecting",
        source: "codex-local",
        importance: 0.9
      }
    });

    const contextResponse = await app.inject({
      method: "GET",
      url: "/projects/prj_123/context"
    });

    expect(conversationResponse.statusCode).toBe(404);
    expect(memoryResponse.statusCode).toBe(404);
    expect(contextResponse.statusCode).toBe(404);
  });
});
