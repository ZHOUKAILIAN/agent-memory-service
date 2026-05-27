import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("POST /tasks/:id/checkpoints", () => {
  it("stores a checkpoint and updates task summary state", async () => {
    const createCheckpoint = vi.fn().mockResolvedValue({
      id: "tcp_123",
      task_id: "tsk_123",
      source: "agent-continuity-cli",
      summary: "Validated callback URL on server",
      content: "Summary: Validated callback URL on server",
      current_status: "in_progress",
      decisions: ["Only trust server-side callback validation"],
      constraints: [],
      next_steps: ["Add redirect tests"],
      created_at: "2026-04-11T01:20:00.000Z"
    });

    const upsertTaskSummary = vi.fn().mockResolvedValue({
      task_id: "tsk_123",
      current_status: "in_progress",
      summary: "Validated callback URL on server",
      active_decisions: ["Only trust server-side callback validation"],
      active_constraints: [],
      next_steps: ["Add redirect tests"],
      updated_at: "2026-04-11T01:20:00.000Z"
    });

    const app = buildApp({
      taskCheckpointRepository: {
        createCheckpoint,
        listCheckpointsByTask: vi.fn()
      },
      taskSummaryRepository: {
        getTaskSummaryByTaskId: vi.fn(),
        upsertTaskSummary
      }
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/tasks/tsk_123/checkpoints",
      payload: {
        source: "agent-continuity-cli",
        summary: "Validated callback URL on server",
        current_status: "in_progress",
        decisions: ["Only trust server-side callback validation"],
        next_steps: ["Add redirect tests"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createCheckpoint).toHaveBeenCalledOnce();
    expect(upsertTaskSummary).toHaveBeenCalledOnce();
    expect(response.json().checkpoint.id).toBe("tcp_123");
    expect(response.json().summary.current_status).toBe("in_progress");
  });
});
