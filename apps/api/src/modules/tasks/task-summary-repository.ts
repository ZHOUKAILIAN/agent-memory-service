import type { Pool } from "pg";

export type TaskSummaryRecord = {
  task_id: string;
  summary: string;
  current_status?: string | null;
  active_decisions: string[];
  active_constraints: string[];
  next_steps: string[];
  updated_at: string;
};

export type UpsertTaskSummaryInput = {
  task_id: string;
  summary: string;
  current_status?: string | null;
  active_decisions: string[];
  active_constraints: string[];
  next_steps: string[];
};

export interface TaskSummaryRepository {
  getTaskSummaryByTaskId(taskId: string): Promise<TaskSummaryRecord | null>;
  upsertTaskSummary(input: UpsertTaskSummaryInput): Promise<TaskSummaryRecord>;
}

export function createUnavailableTaskSummaryRepository(): TaskSummaryRepository {
  return {
    async getTaskSummaryByTaskId() {
      throw new Error("task summary repository is not configured");
    },
    async upsertTaskSummary() {
      throw new Error("task summary repository is not configured");
    }
  };
}

export function createPostgresTaskSummaryRepository(pool: Pool): TaskSummaryRepository {
  return {
    async getTaskSummaryByTaskId(taskId) {
      const result = await pool.query<TaskSummaryRecord>(
        `
          select task_id, summary, current_status, active_decisions, active_constraints, next_steps, updated_at
          from task_summary_memories
          where task_id = $1
        `,
        [taskId]
      );

      return result.rows[0] ?? null;
    },
    async upsertTaskSummary(input) {
      const now = new Date().toISOString();
      const result = await pool.query<TaskSummaryRecord>(
        `
          insert into task_summary_memories (
            task_id,
            summary,
            current_status,
            active_decisions,
            active_constraints,
            next_steps,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (task_id)
          do update set
            summary = excluded.summary,
            current_status = excluded.current_status,
            active_decisions = excluded.active_decisions,
            active_constraints = excluded.active_constraints,
            next_steps = excluded.next_steps,
            updated_at = excluded.updated_at
          returning task_id, summary, current_status, active_decisions, active_constraints, next_steps, updated_at
        `,
        [
          input.task_id,
          input.summary,
          input.current_status ?? null,
          input.active_decisions,
          input.active_constraints,
          input.next_steps,
          now
        ]
      );

      return result.rows[0]!;
    }
  };
}
