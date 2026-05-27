import Fastify from "fastify";
import { ZodError } from "zod";

import { createUnavailableProjectRepository, type ProjectRepository } from "./modules/projects/project-repository.js";
import {
  createUnavailableTaskCheckpointRepository,
  type TaskCheckpointRepository
} from "./modules/tasks/task-checkpoint-repository.js";
import { createUnavailableTaskRepository, type TaskRepository } from "./modules/tasks/task-repository.js";
import {
  createUnavailableTaskSummaryRepository,
  type TaskSummaryRepository
} from "./modules/tasks/task-summary-repository.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export type AppDependencies = {
  projectRepository: ProjectRepository;
  taskCheckpointRepository: TaskCheckpointRepository;
  taskRepository: TaskRepository;
  taskSummaryRepository: TaskSummaryRepository;
};

export function buildApp(overrides: Partial<AppDependencies> = {}) {
  const app = Fastify();
  const dependencies: AppDependencies = {
    projectRepository: overrides.projectRepository ?? createUnavailableProjectRepository(),
    taskCheckpointRepository:
      overrides.taskCheckpointRepository ?? createUnavailableTaskCheckpointRepository(),
    taskRepository: overrides.taskRepository ?? createUnavailableTaskRepository(),
    taskSummaryRepository:
      overrides.taskSummaryRepository ?? createUnavailableTaskSummaryRepository()
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
  registerTaskRoutes(app, dependencies);

  return app;
}
