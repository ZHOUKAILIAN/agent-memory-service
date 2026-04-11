import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { CreateProjectInput } from "./project-schema.js";

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  repo_url?: string | null;
  created_at: string;
  updated_at: string;
};

export interface ProjectRepository {
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  getProjectById(projectId: string): Promise<ProjectRecord | null>;
}

export function createUnavailableProjectRepository(): ProjectRepository {
  return {
    async createProject() {
      throw new Error("project repository is not configured");
    },
    async getProjectById() {
      throw new Error("project repository is not configured");
    }
  };
}

export function createPostgresProjectRepository(pool: Pool): ProjectRepository {
  return {
    async createProject(input) {
      const now = new Date().toISOString();
      const project: ProjectRecord = {
        id: `prj_${randomUUID().replace(/-/g, "")}`,
        name: input.name,
        description: input.description,
        repo_url: input.repo_url ?? null,
        created_at: now,
        updated_at: now
      };

      await pool.query(
        `
          insert into projects (id, name, description, repo_url, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          project.id,
          project.name,
          project.description,
          project.repo_url ?? null,
          project.created_at,
          project.updated_at
        ]
      );

      return project;
    },
    async getProjectById(projectId) {
      const result = await pool.query<ProjectRecord>(
        `
          select id, name, description, repo_url, created_at, updated_at
          from projects
          where id = $1
        `,
        [projectId]
      );

      return result.rows[0] ?? null;
    }
  };
}
