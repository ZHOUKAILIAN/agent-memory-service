import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("POST /projects/resolve", () => {
  it("returns an existing project when repo_url already matches", async () => {
    const findProjectByRepoUrl = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "demo-project",
      description: "shared context",
      repo_url: "https://github.com/acme/demo",
      created_at: "2026-04-11T01:00:00.000Z",
      updated_at: "2026-04-11T01:00:00.000Z"
    });

    const createProject = vi.fn();

    const app = buildApp({
      projectRepository: {
        createProject,
        getProjectById: vi.fn(),
        findProjectByName: vi.fn(),
        findProjectByRepoUrl
      }
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/projects/resolve",
      payload: {
        name: "demo-project",
        description: "shared context",
        repo_url: "https://github.com/acme/demo"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(findProjectByRepoUrl).toHaveBeenCalledOnce();
    expect(createProject).not.toHaveBeenCalled();
    expect(response.json().project.id).toBe("prj_123");
  });
});

describe("POST /tasks/resolve", () => {
  it("returns an existing task when title already matches inside a project", async () => {
    const findTaskByProjectAndTitle = vi.fn().mockResolvedValue({
      id: "tsk_123",
      project_id: "prj_123",
      title: "Validate callback URL",
      description: "Task description",
      source: "agent-memory-cli",
      external_ref: null,
      created_at: "2026-04-11T01:10:00.000Z",
      updated_at: "2026-04-11T01:10:00.000Z"
    });

    const createTask = vi.fn();

    const app = buildApp({
      taskRepository: {
        createTask,
        findTaskById: vi.fn(),
        findTaskByExternalRef: vi.fn(),
        findTaskByProjectAndTitle
      }
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/tasks/resolve",
      payload: {
        project_id: "prj_123",
        title: "Validate callback URL",
        description: "Task description",
        source: "agent-memory-cli"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(findTaskByProjectAndTitle).toHaveBeenCalledOnce();
    expect(createTask).not.toHaveBeenCalled();
    expect(response.json().task.id).toBe("tsk_123");
  });
});
