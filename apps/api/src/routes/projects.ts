import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createConversationSchema } from "../modules/conversations/conversation-schema.js";
import type { ConversationRepository } from "../modules/conversations/conversation-repository.js";
import type { ContextService } from "../modules/context/context-service.js";
import { createMemoryBlockSchema } from "../modules/memory/memory-schema.js";
import type { MemoryRepository } from "../modules/memory/memory-repository.js";
import { createProjectSchema, resolveProjectSchema } from "../modules/projects/project-schema.js";
import type { ProjectRepository } from "../modules/projects/project-repository.js";

const contextQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional()
});

type ProjectRouteDependencies = {
  conversationRepository: ConversationRepository;
  contextService: ContextService;
  memoryRepository: MemoryRepository;
  projectRepository: ProjectRepository;
};

export function registerProjectRoutes(app: FastifyInstance, dependencies: ProjectRouteDependencies) {
  app.post("/projects", async (request, reply) => {
    const payload = createProjectSchema.parse(request.body);
    const project = await dependencies.projectRepository.createProject(payload);

    return reply.code(201).send({ project });
  });

  app.post("/projects/resolve", async (request, reply) => {
    const payload = resolveProjectSchema.parse(request.body);

    if (payload.repo_url && dependencies.projectRepository.findProjectByRepoUrl) {
      const existingByRepoUrl = await dependencies.projectRepository.findProjectByRepoUrl(payload.repo_url);

      if (existingByRepoUrl) {
        return reply.code(200).send({ project: existingByRepoUrl });
      }
    }

    if (dependencies.projectRepository.findProjectByName) {
      const existingByName = await dependencies.projectRepository.findProjectByName(payload.name);

      if (existingByName) {
        return reply.code(200).send({ project: existingByName });
      }
    }

    const project = await dependencies.projectRepository.createProject(payload);
    return reply.code(200).send({ project });
  });

  app.post("/projects/:id/conversations", async (request, reply) => {
    const payload = createConversationSchema.parse(request.body);
    const { id } = request.params as { id: string };
    const conversationEntry = await dependencies.conversationRepository.createConversationEntry({
      project_id: id,
      ...payload
    });

    return reply.code(201).send({ conversation_entry: conversationEntry });
  });

  app.post("/projects/:id/memory-blocks", async (request, reply) => {
    const payload = createMemoryBlockSchema.parse(request.body);
    const { id } = request.params as { id: string };
    const memoryBlock = await dependencies.memoryRepository.upsertMemoryBlock({
      project_id: id,
      ...payload
    });

    return reply.code(201).send({ memory_block: memoryBlock });
  });

  app.get("/projects/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = contextQuerySchema.parse(request.query ?? {});
    const context = await dependencies.contextService.buildContextBundle({
      projectId: id,
      projectRepository: dependencies.projectRepository,
      memoryRepository: dependencies.memoryRepository,
      conversationRepository: dependencies.conversationRepository,
      limit
    });

    return reply.code(200).send(context);
  });

  app.post("/projects/:id/context/refresh", async (request, reply) => {
    const { id } = request.params as { id: string };
    const context = await dependencies.contextService.buildContextBundle({
      projectId: id,
      projectRepository: dependencies.projectRepository,
      memoryRepository: dependencies.memoryRepository,
      conversationRepository: dependencies.conversationRepository
    });

    return reply.code(200).send(context);
  });
}
