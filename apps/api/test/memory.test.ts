import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("POST /projects/:id/memory-blocks", () => {
  it("stores a memory block", async () => {
    const upsertMemoryBlock = vi.fn().mockResolvedValue({
      id: "mem_123",
      project_id: "prj_123",
      block_type: "decisions",
      title: "Validate callback URL on server",
      content: "Do validation before redirecting",
      source: "codex-local",
      importance: 0.9,
      created_at: "2026-04-11T01:05:00.000Z",
      updated_at: "2026-04-11T01:05:00.000Z"
    });

    const app = buildApp({
      memoryRepository: {
        upsertMemoryBlock,
        listMemoryBlocksByProject: vi.fn()
      }
    });

    const response = await app.inject({
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

    expect(response.statusCode).toBe(201);
    expect(upsertMemoryBlock).toHaveBeenCalledOnce();
    expect(response.json().memory_block.id).toBe("mem_123");
  });
});
