import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { CreateMemoryBlockInput, MemoryBlockType } from "./memory-schema.js";

export type MemoryBlockRecord = {
  id: string;
  project_id: string;
  block_type: MemoryBlockType;
  title: string;
  content: string;
  source: string;
  importance: number;
  created_at: string;
  updated_at: string;
};

export interface MemoryRepository {
  upsertMemoryBlock(input: CreateMemoryBlockInput & { project_id: string }): Promise<MemoryBlockRecord>;
  listMemoryBlocksByProject(projectId: string): Promise<MemoryBlockRecord[]>;
}

export function createUnavailableMemoryRepository(): MemoryRepository {
  return {
    async upsertMemoryBlock() {
      throw new Error("memory repository is not configured");
    },
    async listMemoryBlocksByProject() {
      throw new Error("memory repository is not configured");
    }
  };
}

export function createPostgresMemoryRepository(pool: Pool): MemoryRepository {
  return {
    async upsertMemoryBlock(input) {
      const now = new Date().toISOString();
      const result = await pool.query<MemoryBlockRecord>(
        `
          insert into memory_blocks (
            id,
            project_id,
            block_type,
            title,
            content,
            source,
            importance,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (project_id, block_type, title)
          do update set
            content = excluded.content,
            source = excluded.source,
            importance = excluded.importance,
            updated_at = excluded.updated_at
          returning id, project_id, block_type, title, content, source, importance, created_at, updated_at
        `,
        [
          `mem_${randomUUID().replace(/-/g, "")}`,
          input.project_id,
          input.block_type,
          input.title,
          input.content,
          input.source,
          input.importance,
          now,
          now
        ]
      );

      return result.rows[0]!;
    },
    async listMemoryBlocksByProject(projectId) {
      const result = await pool.query<MemoryBlockRecord>(
        `
          select id, project_id, block_type, title, content, source, importance, created_at, updated_at
          from memory_blocks
          where project_id = $1
        `,
        [projectId]
      );

      return result.rows;
    }
  };
}
