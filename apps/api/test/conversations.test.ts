import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("POST /projects/:id/conversations", () => {
  it("stores a conversation entry", async () => {
    const createConversationEntry = vi.fn().mockResolvedValue({
      id: "cev_123",
      project_id: "prj_123",
      source: "codex-local",
      entry_type: "assistant_message",
      actor: "assistant",
      content: "Implemented fix",
      summary: "Fix completed",
      tags: ["auth"],
      created_at: "2026-04-11T01:03:00.000Z"
    });

    const app = buildApp({
      conversationRepository: {
        createConversationEntry,
        listConversationEntriesByProject: vi.fn()
      }
    });

    const response = await app.inject({
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

    expect(response.statusCode).toBe(201);
    expect(createConversationEntry).toHaveBeenCalledOnce();
    expect(response.json().conversation_entry.id).toBe("cev_123");
  });
});
