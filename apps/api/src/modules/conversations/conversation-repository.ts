import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { CreateConversationInput } from "./conversation-schema.js";

export type ConversationEntryRecord = {
  id: string;
  project_id: string;
  source: string;
  entry_type: string;
  actor: "user" | "assistant" | "tool" | "system";
  content: string;
  summary?: string | null;
  tags: string[];
  created_at: string;
};

export interface ConversationRepository {
  createConversationEntry(input: CreateConversationInput & { project_id: string }): Promise<ConversationEntryRecord>;
  listConversationEntriesByProject(projectId: string, limit?: number): Promise<ConversationEntryRecord[]>;
}

export function createUnavailableConversationRepository(): ConversationRepository {
  return {
    async createConversationEntry() {
      throw new Error("conversation repository is not configured");
    },
    async listConversationEntriesByProject() {
      throw new Error("conversation repository is not configured");
    }
  };
}

export function createPostgresConversationRepository(pool: Pool): ConversationRepository {
  return {
    async createConversationEntry(input) {
      const entry: ConversationEntryRecord = {
        id: `cev_${randomUUID().replace(/-/g, "")}`,
        project_id: input.project_id,
        source: input.source,
        entry_type: input.entry_type,
        actor: input.actor,
        content: input.content,
        summary: input.summary ?? null,
        tags: input.tags,
        created_at: new Date().toISOString()
      };

      await pool.query(
        `
          insert into conversation_entries (
            id,
            project_id,
            source,
            entry_type,
            actor,
            content,
            summary,
            tags,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          entry.id,
          entry.project_id,
          entry.source,
          entry.entry_type,
          entry.actor,
          entry.content,
          entry.summary ?? null,
          entry.tags,
          entry.created_at
        ]
      );

      return entry;
    },
    async listConversationEntriesByProject(projectId, limit = 10) {
      const result = await pool.query<ConversationEntryRecord>(
        `
          select id, project_id, source, entry_type, actor, content, summary, tags, created_at
          from conversation_entries
          where project_id = $1
          order by created_at desc
          limit $2
        `,
        [projectId, limit]
      );

      return result.rows;
    }
  };
}
