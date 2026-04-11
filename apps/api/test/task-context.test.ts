import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /tasks/:id/context", () => {
  it("returns task summary and recent checkpoints", async () => {
    const getProjectById = vi.fn().mockResolvedValue({
      id: "prj_123",
      name: "demo-project",
      description: "shared context",
      repo_url: "https://github.com/acme/demo",
      created_at: "2026-04-11T01:00:00.000Z",
      updated_at: "2026-04-11T01:00:00.000Z"
    });

    const findTaskById = vi.fn().mockResolvedValue({
      id: "tsk_123",
      project_id: "prj_123",
      title: "Validate callback URL",
      description: "Task description",
      source: "agent-memory-cli",
      external_ref: null,
      created_at: "2026-04-11T01:10:00.000Z",
      updated_at: "2026-04-11T01:10:00.000Z"
    });

    const getTaskSummaryByTaskId = vi.fn().mockResolvedValue({
      task_id: "tsk_123",
      summary: "Validated callback URL on server",
      current_status: "in_progress",
      active_decisions: ["Only trust server-side callback validation"],
      active_constraints: [],
      next_steps: ["Add redirect tests"],
      updated_at: "2026-04-11T01:20:00.000Z"
    });

    const listCheckpointsByTask = vi.fn().mockResolvedValue([
      {
        id: "tcp_123",
        task_id: "tsk_123",
        source: "agent-memory-cli",
        summary: "Validated callback URL on server",
        content: "Summary: Validated callback URL on server",
        current_status: "in_progress",
        decisions: ["Only trust server-side callback validation"],
        constraints: [],
        next_steps: ["Add redirect tests"],
        created_at: "2026-04-11T01:20:00.000Z"
      }
    ]);

    const app = buildApp({
      projectRepository: {
        createProject: vi.fn(),
        getProjectById,
        findProjectByName: vi.fn(),
        findProjectByRepoUrl: vi.fn()
      },
      taskRepository: {
        createTask: vi.fn(),
        findTaskByExternalRef: vi.fn(),
        findTaskById,
        findTaskByProjectAndTitle: vi.fn()
      },
      taskSummaryRepository: {
        getTaskSummaryByTaskId,
        upsertTaskSummary: vi.fn()
      },
      taskCheckpointRepository: {
        createCheckpoint: vi.fn(),
        listCheckpointsByTask
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/tasks/tsk_123/context"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().project.id).toBe("prj_123");
    expect(response.json().task.id).toBe("tsk_123");
    expect(response.json().summary.current_status).toBe("in_progress");
    expect(response.json().checkpoints.recent[0].id).toBe("tcp_123");
  });
});
