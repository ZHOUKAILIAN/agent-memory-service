import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ProjectRepository } from "../modules/projects/project-repository.js";
import type { TaskCheckpointRepository } from "../modules/tasks/task-checkpoint-repository.js";
import { buildTaskContext } from "../modules/tasks/task-context-service.js";
import { createTaskCheckpointSchema, resolveTaskSchema } from "../modules/tasks/task-schema.js";
import type { TaskRepository } from "../modules/tasks/task-repository.js";
import type { TaskSummaryRepository } from "../modules/tasks/task-summary-repository.js";

const taskContextQuerySchema = z.object({
  checkpoint_limit: z.coerce.number().int().positive().optional()
});

export type TaskRouteDependencies = {
  projectRepository: ProjectRepository;
  taskCheckpointRepository: TaskCheckpointRepository;
  taskRepository: TaskRepository;
  taskSummaryRepository: TaskSummaryRepository;
};

export function registerTaskRoutes(app: FastifyInstance, dependencies: TaskRouteDependencies) {
  app.post("/tasks/resolve", async (request, reply) => {
    const payload = resolveTaskSchema.parse(request.body);

    if (payload.external_ref) {
      const existingByExternalRef = await dependencies.taskRepository.findTaskByExternalRef(payload.external_ref);

      if (existingByExternalRef) {
        return reply.code(200).send({ task: existingByExternalRef });
      }
    }

    const existingByProjectAndTitle = await dependencies.taskRepository.findTaskByProjectAndTitle(
      payload.project_id,
      payload.title
    );

    if (existingByProjectAndTitle) {
      return reply.code(200).send({ task: existingByProjectAndTitle });
    }

    const task = await dependencies.taskRepository.createTask(payload);
    return reply.code(200).send({ task });
  });

  app.post("/tasks/:id/checkpoints", async (request, reply) => {
    const payload = createTaskCheckpointSchema.parse(request.body);
    const { id } = request.params as { id: string };

    const checkpoint = await dependencies.taskCheckpointRepository.createCheckpoint({
      task_id: id,
      ...payload
    });

    const summary = await dependencies.taskSummaryRepository.upsertTaskSummary({
      task_id: id,
      summary: payload.summary,
      current_status: payload.current_status ?? null,
      active_decisions: payload.decisions,
      active_constraints: payload.constraints,
      next_steps: payload.next_steps
    });

    return reply.code(201).send({ checkpoint, summary });
  });

  app.get("/tasks/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { checkpoint_limit: checkpointLimit } = taskContextQuerySchema.parse(request.query ?? {});
    const context = await buildTaskContext({
      projectRepository: dependencies.projectRepository,
      taskCheckpointRepository: dependencies.taskCheckpointRepository,
      taskRepository: dependencies.taskRepository,
      taskSummaryRepository: dependencies.taskSummaryRepository,
      taskId: id,
      checkpointLimit
    });

    return reply.code(200).send(context);
  });
}
