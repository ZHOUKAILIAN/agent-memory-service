import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { CreateTaskInput } from "./task-schema.js";

export type TaskRecord = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  source: string;
  external_ref?: string | null;
  created_at: string;
  updated_at: string;
};

export interface TaskRepository {
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  findTaskById(taskId: string): Promise<TaskRecord | null>;
  findTaskByProjectAndTitle(projectId: string, title: string): Promise<TaskRecord | null>;
  findTaskByExternalRef(externalRef: string): Promise<TaskRecord | null>;
}

export function createUnavailableTaskRepository(): TaskRepository {
  return {
    async createTask() {
      throw new Error("task repository is not configured");
    },
    async findTaskById() {
      throw new Error("task repository is not configured");
    },
    async findTaskByProjectAndTitle() {
      throw new Error("task repository is not configured");
    },
    async findTaskByExternalRef() {
      throw new Error("task repository is not configured");
    }
  };
}

export function createPostgresTaskRepository(pool: Pool): TaskRepository {
  return {
    async createTask(input) {
      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: `tsk_${randomUUID().replace(/-/g, "")}`,
        project_id: input.project_id,
        title: input.title,
        description: input.description,
        source: input.source,
        external_ref: input.external_ref ?? null,
        created_at: now,
        updated_at: now
      };

      await pool.query(
        `
          insert into tasks (id, project_id, title, description, source, external_ref, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          task.id,
          task.project_id,
          task.title,
          task.description,
          task.source,
          task.external_ref ?? null,
          task.created_at,
          task.updated_at
        ]
      );

      return task;
    },
    async findTaskById(taskId) {
      const result = await pool.query<TaskRecord>(
        `
          select id, project_id, title, description, source, external_ref, created_at, updated_at
          from tasks
          where id = $1
        `,
        [taskId]
      );

      return result.rows[0] ?? null;
    },
    async findTaskByProjectAndTitle(projectId, title) {
      const result = await pool.query<TaskRecord>(
        `
          select id, project_id, title, description, source, external_ref, created_at, updated_at
          from tasks
          where project_id = $1 and title = $2
          limit 1
        `,
        [projectId, title]
      );

      return result.rows[0] ?? null;
    },
    async findTaskByExternalRef(externalRef) {
      const result = await pool.query<TaskRecord>(
        `
          select id, project_id, title, description, source, external_ref, created_at, updated_at
          from tasks
          where external_ref = $1
          limit 1
        `,
        [externalRef]
      );

      return result.rows[0] ?? null;
    }
  };
}
