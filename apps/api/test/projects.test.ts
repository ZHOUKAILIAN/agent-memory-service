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
