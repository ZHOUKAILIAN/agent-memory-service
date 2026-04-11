import Fastify from "fastify";
import { ZodError } from "zod";

import {
  createUnavailableConversationRepository,
  type ConversationRepository
} from "./modules/conversations/conversation-repository.js";
import { contextService, type ContextService } from "./modules/context/context-service.js";
import { createUnavailableMemoryRepository, type MemoryRepository } from "./modules/memory/memory-repository.js";
import { createUnavailableProjectRepository, type ProjectRepository } from "./modules/projects/project-repository.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";

export type AppDependencies = {
  conversationRepository: ConversationRepository;
  contextService: ContextService;
  memoryRepository: MemoryRepository;
  projectRepository: ProjectRepository;
};

export function buildApp(overrides: Partial<AppDependencies> = {}) {
  const app = Fastify();
  const dependencies: AppDependencies = {
    conversationRepository:
      overrides.conversationRepository ?? createUnavailableConversationRepository(),
    contextService: overrides.contextService ?? contextService,
    memoryRepository: overrides.memoryRepository ?? createUnavailableMemoryRepository(),
    projectRepository: overrides.projectRepository ?? createUnavailableProjectRepository()
  };

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "invalid_request",
        details: error.issues
      });
    }

    const statusCode =
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    return reply.code(statusCode).send({
      error: statusCode === 404 ? "not_found" : "internal_error",
      message: error.message
    });
  });

  registerHealthRoutes(app);
  registerProjectRoutes(app, dependencies);

  return app;
}
