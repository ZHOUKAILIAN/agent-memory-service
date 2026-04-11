import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { CreateTaskCheckpointInput } from "./task-schema.js";

export type TaskCheckpointRecord = {
  id: string;
  task_id: string;
  source: string;
  summary: string;
  content: string;
  current_status?: string | null;
  decisions: string[];
  constraints: string[];
  next_steps: string[];
  created_at: string;
};

export interface TaskCheckpointRepository {
  createCheckpoint(input: CreateTaskCheckpointInput & { task_id: string }): Promise<TaskCheckpointRecord>;
  listCheckpointsByTask(taskId: string, limit?: number): Promise<TaskCheckpointRecord[]>;
}

export function createUnavailableTaskCheckpointRepository(): TaskCheckpointRepository {
  return {
    async createCheckpoint() {
      throw new Error("task checkpoint repository is not configured");
    },
    async listCheckpointsByTask() {
      throw new Error("task checkpoint repository is not configured");
    }
  };
}

export function createPostgresTaskCheckpointRepository(pool: Pool): TaskCheckpointRepository {
  return {
    async createCheckpoint(input) {
      const checkpoint: TaskCheckpointRecord = {
        id: `tcp_${randomUUID().replace(/-/g, "")}`,
        task_id: input.task_id,
        source: input.source,
        summary: input.summary,
        content: input.content ?? input.summary,
        current_status: input.current_status ?? null,
        decisions: input.decisions,
        constraints: input.constraints,
        next_steps: input.next_steps,
        created_at: new Date().toISOString()
      };

      await pool.query(
        `
          insert into task_checkpoints (
            id,
            task_id,
            source,
            summary,
            content,
            current_status,
            decisions,
            constraints,
            next_steps,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          checkpoint.id,
          checkpoint.task_id,
          checkpoint.source,
          checkpoint.summary,
          checkpoint.content,
          checkpoint.current_status ?? null,
          checkpoint.decisions,
          checkpoint.constraints,
          checkpoint.next_steps,
          checkpoint.created_at
        ]
      );

      return checkpoint;
    },
    async listCheckpointsByTask(taskId, limit = 3) {
      const result = await pool.query<TaskCheckpointRecord>(
        `
          select id, task_id, source, summary, content, current_status, decisions, constraints, next_steps, created_at
          from task_checkpoints
          where task_id = $1
          order by created_at desc
          limit $2
        `,
        [taskId, limit]
      );

      return result.rows;
    }
  };
}
