import type { ConversationRepository } from "../conversations/conversation-repository.js";
import type { MemoryBlockRecord, MemoryRepository } from "../memory/memory-repository.js";
import type { MemoryBlockType } from "../memory/memory-schema.js";
import type { ProjectRepository } from "../projects/project-repository.js";

const memoryBlockTypes: MemoryBlockType[] = [
  "background",
  "constraints",
  "decisions",
  "todo",
  "status"
];

export type ContextServiceDependencies = {
  conversationRepository: ConversationRepository;
  memoryRepository: MemoryRepository;
  projectId: string;
  projectRepository: ProjectRepository;
  limit?: number;
};

export type ContextService = {
  buildContextBundle(input: ContextServiceDependencies): Promise<{
    project: {
      id: string;
      name: string;
      description: string;
      repo_url?: string | null;
    };
    memory: Record<
      MemoryBlockType,
      Array<{
        id: string;
        title: string;
        content: string;
        source: string;
        importance: number;
        updated_at: string;
      }>
    >;
    conversation: {
      recent_entries: Array<{
        id: string;
        summary: string;
        created_at: string;
      }>;
    };
    generated_at: string;
  }>;
};

export const contextService: ContextService = {
  buildContextBundle
};

export async function buildContextBundle({
  conversationRepository,
  memoryRepository,
  projectId,
  projectRepository,
  limit
}: ContextServiceDependencies) {
  const project = await projectRepository.getProjectById(projectId);

  if (!project) {
    const error = new Error(`project not found: ${projectId}`) as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const memoryBlocks = await memoryRepository.listMemoryBlocksByProject(projectId);
  const conversationEntries = await conversationRepository.listConversationEntriesByProject(projectId, limit);

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      repo_url: project.repo_url ?? null
    },
    memory: groupMemoryBlocks(memoryBlocks),
    conversation: {
      recent_entries: conversationEntries.map((entry) => ({
        id: entry.id,
        summary: entry.summary ?? entry.content,
        created_at: entry.created_at
      }))
    },
    generated_at: new Date().toISOString()
  };
}

function groupMemoryBlocks(memoryBlocks: MemoryBlockRecord[]) {
  const grouped: Record<
    MemoryBlockType,
    Array<{
      id: string;
      title: string;
      content: string;
      source: string;
      importance: number;
      updated_at: string;
    }>
  > = {
    background: [],
    constraints: [],
    decisions: [],
    todo: [],
    status: []
  };

  const sortedBlocks = [...memoryBlocks].sort((left, right) => {
    if (left.importance !== right.importance) {
      return right.importance - left.importance;
    }

    return right.updated_at.localeCompare(left.updated_at);
  });

  for (const memoryBlock of sortedBlocks) {
    grouped[memoryBlock.block_type].push({
      id: memoryBlock.id,
      title: memoryBlock.title,
      content: memoryBlock.content,
      source: memoryBlock.source,
      importance: memoryBlock.importance,
      updated_at: memoryBlock.updated_at
    });
  }

  return grouped;
}
